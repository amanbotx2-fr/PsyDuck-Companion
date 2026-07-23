const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  PomodoroManager,
} = require('../dist/main/PomodoroManager.js');
const {
  POMODORO_DURATION_OPTIONS,
  formatPomodoroTime,
  parsePomodoroDuration,
} = require('../dist/shared/pomodoro.js');

class MemoryPersistence {
  constructor(value = null) {
    this.value = value;
    this.savedDocuments = [];
  }

  async load() {
    return this.value === null
      ? null
      : structuredClone(this.value);
  }

  async save(document) {
    this.value = structuredClone(document);
    this.savedDocuments.push(structuredClone(document));
  }
}

class FakeClock {
  constructor(now = 0) {
    this.currentTime = now;
    this.nextTimerId = 1;
    this.timers = new Map();
  }

  now = () => this.currentTime;

  scheduler = {
    setTimeout: (callback, delayMs) => {
      const timerId = this.nextTimerId;
      this.nextTimerId += 1;
      this.timers.set(timerId, {
        callback,
        dueAt: this.currentTime + delayMs,
      });
      return timerId;
    },
    clearTimeout: (timerId) => {
      this.timers.delete(timerId);
    },
  };

  advance(milliseconds) {
    this.currentTime += milliseconds;

    while (true) {
      const dueTimer = [...this.timers.entries()]
        .filter(([, timer]) => timer.dueAt <= this.currentTime)
        .sort(
          ([leftId, left], [rightId, right]) =>
            left.dueAt - right.dueAt || leftId - rightId,
        )[0];

      if (dueTimer === undefined) {
        return;
      }

      const [timerId, timer] = dueTimer;
      this.timers.delete(timerId);
      timer.callback();
    }
  }
}

const createManager = (
  persistence = new MemoryPersistence(),
  clock = new FakeClock(),
) => ({
  clock,
  manager: new PomodoroManager({
    persistence,
    now: clock.now,
    scheduler: clock.scheduler,
    logError: () => undefined,
  }),
  persistence,
});

describe('PomodoroManager', () => {
  test('ticks once per second and keeps exactly one timer scheduled', async () => {
    const { clock, manager } = createManager();
    const snapshots = [];
    manager.subscribe((state) => snapshots.push(state));
    await manager.load();

    manager.start(1);
    assert.equal(clock.timers.size, 1);
    assert.equal(manager.getState().remainingSeconds, 60);

    clock.advance(1_000);
    assert.equal(clock.timers.size, 1);
    assert.equal(manager.getState().remainingSeconds, 59);
    assert.equal(snapshots.at(-1).remainingSeconds, 59);

    manager.start(1);
    assert.equal(clock.timers.size, 1);
    manager.dispose();
  });

  test('pauses, resumes accurately, and stops cleanly', async () => {
    const { clock, manager, persistence } = createManager();
    await manager.load();

    manager.start(1);
    clock.advance(5_000);
    manager.pause();
    assert.equal(manager.getState().paused, true);
    assert.equal(manager.getState().remainingSeconds, 55);
    assert.equal(clock.timers.size, 0);

    clock.advance(30_000);
    assert.equal(manager.getState().remainingSeconds, 55);

    manager.resume();
    assert.equal(clock.timers.size, 1);
    clock.advance(1_000);
    assert.equal(manager.getState().remainingSeconds, 54);

    manager.stop();
    assert.equal(manager.getState().running, false);
    assert.equal(manager.getState().remainingSeconds, 0);
    assert.equal(clock.timers.size, 0);

    await manager.flushPersistence();
    assert.equal(persistence.value.state.running, false);
    manager.dispose();
  });

  test('completes once, clears the widget state, and persists completion', async () => {
    const { clock, manager, persistence } = createManager();
    let completions = 0;
    manager.onComplete(() => {
      completions += 1;
    });
    await manager.load();

    manager.start(1);
    clock.advance(60_000);

    assert.equal(completions, 1);
    assert.equal(manager.getState().running, false);
    assert.equal(clock.timers.size, 0);
    await manager.flushPersistence();
    assert.equal(persistence.value.state.running, false);
    manager.dispose();
  });

  test('restores running and paused sessions using elapsed real time', async () => {
    const runningDocument = {
      version: 1,
      state: {
        running: true,
        paused: false,
        selectedDurationMinutes: 25,
        durationMinutes: 25,
        remainingSeconds: 1_500,
        startedAt: 10_000,
      },
    };
    const runningClock = new FakeClock(70_000);
    const running = createManager(
      new MemoryPersistence(runningDocument),
      runningClock,
    );
    await running.manager.load();
    assert.equal(running.manager.getState().remainingSeconds, 1_440);
    assert.equal(runningClock.timers.size, 1);

    const pausedDocument = {
      version: 1,
      state: {
        running: true,
        paused: true,
        selectedDurationMinutes: 25,
        durationMinutes: 25,
        remainingSeconds: 900,
        startedAt: 10_000,
      },
    };
    const pausedClock = new FakeClock(500_000);
    const paused = createManager(
      new MemoryPersistence(pausedDocument),
      pausedClock,
    );
    await paused.manager.load();
    assert.equal(paused.manager.getState().remainingSeconds, 900);
    assert.equal(pausedClock.timers.size, 0);

    running.manager.dispose();
    paused.manager.dispose();
  });

  test('completes an expired session during restoration', async () => {
    const persistence = new MemoryPersistence({
      version: 1,
      state: {
        running: true,
        paused: false,
        selectedDurationMinutes: 15,
        durationMinutes: 15,
        remainingSeconds: 30,
        startedAt: 1_000,
      },
    });
    const clock = new FakeClock(60_000);
    const { manager } = createManager(persistence, clock);
    let completions = 0;
    manager.onComplete(() => {
      completions += 1;
    });

    await manager.load();
    assert.equal(completions, 1);
    assert.equal(manager.getState().running, false);
    await manager.flushPersistence();
    assert.equal(persistence.value.state.running, false);
    manager.dispose();
  });

  test('keeps duration selection separate from an active session', async () => {
    const { clock, manager, persistence } = createManager();
    await manager.load();

    manager.setDuration(45);
    manager.start();
    clock.advance(5_000);
    manager.setDuration(15);

    const state = manager.getState();
    assert.equal(state.durationMinutes, 45);
    assert.equal(state.selectedDurationMinutes, 15);
    assert.equal(state.remainingSeconds, 2_695);

    clock.advance(5_000);
    assert.equal(manager.getState().remainingSeconds, 2_690);

    await manager.flushPersistence();
    assert.equal(
      persistence.value.state.selectedDurationMinutes,
      15,
    );
    assert.equal(persistence.value.state.durationMinutes, 45);
    assert.throws(() => manager.setDuration(0), RangeError);
    assert.throws(() => manager.start(721), RangeError);
    manager.dispose();
  });
});

describe('Pomodoro formatting and validation', () => {
  test('exposes the supported focus presets', () => {
    assert.deepEqual([...POMODORO_DURATION_OPTIONS], [25, 50, 90]);
  });

  test('formats stable minute and second values', () => {
    assert.equal(formatPomodoroTime(1_498), '24:58');
    assert.equal(formatPomodoroTime(60), '01:00');
    assert.equal(formatPomodoroTime(0), '00:00');
    assert.equal(formatPomodoroTime(14_400), '240:00');
    assert.equal(formatPomodoroTime(43_200), '720:00');
  });

  test('accepts only whole-minute values from 1 through 720', () => {
    assert.equal(parsePomodoroDuration(' 25 '), 25);
    assert.equal(parsePomodoroDuration('1'), 1);
    assert.equal(parsePomodoroDuration('240'), 240);
    assert.equal(parsePomodoroDuration('720'), 720);
    assert.equal(parsePomodoroDuration('0'), null);
    assert.equal(parsePomodoroDuration('721'), null);
    assert.equal(parsePomodoroDuration('-1'), null);
    assert.equal(parsePomodoroDuration('1.5'), null);
    assert.equal(parsePomodoroDuration(''), null);
    assert.equal(parsePomodoroDuration('NaN'), null);
    assert.equal(parsePomodoroDuration('abc'), null);
  });
});
