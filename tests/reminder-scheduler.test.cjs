const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  REMINDER_EVENT_TYPES,
} = require('../dist/main/ReminderEvents.js');
const {
  ReminderScheduler,
} = require('../dist/main/ReminderScheduler.js');

const BASE_TIME = Date.parse('2030-01-01T12:00:00.000Z');

const createReminder = (id, scheduledAt, overrides = {}) => ({
  id,
  title: `Reminder ${id}`,
  message: '',
  scheduledAt: new Date(scheduledAt).toISOString(),
  completed: false,
  createdAt: '2029-12-01T00:00:00.000Z',
  updatedAt: '2029-12-01T00:00:00.000Z',
  ...overrides,
});

class FakeReminderSource {
  constructor(reminders) {
    this.listeners = new Set();
    this.markCompletedCalls = [];
    this.reminders = reminders.map((reminder) => ({ ...reminder }));
  }

  listReminders() {
    return this.reminders.map((reminder) => ({ ...reminder }));
  }

  async markCompleted(id) {
    const index = this.reminders.findIndex((reminder) => reminder.id === id);

    if (index < 0) {
      throw new Error('Reminder not found.');
    }

    this.markCompletedCalls.push(id);
    this.reminders[index] = {
      ...this.reminders[index],
      completed: true,
      updatedAt: new Date(BASE_TIME).toISOString(),
    };
    this.notify();
    return { ...this.reminders[index] };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  addReminder(reminder) {
    this.reminders.push({ ...reminder });
    this.notify();
  }

  notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

class SingleTimerHarness {
  constructor() {
    this.active = null;
    this.maximumActiveCount = 0;
    this.nextId = 1;
    this.scheduleHistory = [];
  }

  schedule(callback, delayMs) {
    assert.equal(
      this.active,
      null,
      'ReminderScheduler attempted to create a second active timer.',
    );

    const handle = this.nextId;
    this.nextId += 1;
    this.active = { callback, delayMs, handle };
    this.maximumActiveCount = Math.max(this.maximumActiveCount, 1);
    this.scheduleHistory.push(delayMs);
    return handle;
  }

  cancel(handle) {
    if (this.active?.handle === handle) {
      this.active = null;
    }
  }

  get activeCount() {
    return this.active === null ? 0 : 1;
  }

  get delayMs() {
    return this.active?.delayMs ?? null;
  }

  async fire() {
    assert.notEqual(this.active, null, 'No reminder timer is scheduled.');
    const { callback } = this.active;
    this.active = null;
    await callback();
  }
}

const settleScheduler = async (scheduler) => {
  await scheduler.resynchronize();
  await scheduler.resynchronize();
};

const createScheduler = (
  source,
  timer,
  readNow,
  overrides = {},
) =>
  new ReminderScheduler(source, {
    clockValidationIntervalMs: 60_000,
    maximumOverdueAgeMs: 60 * 60 * 1_000,
    now: readNow,
    timer,
    ...overrides,
  });

describe('ReminderScheduler', () => {
  test('initializes with only the next valid, incomplete reminder scheduled', async () => {
    let now = BASE_TIME;
    const source = new FakeReminderSource([
      createReminder('later', now + 10_000),
      createReminder('completed', now + 1_000, { completed: true }),
      createReminder('expired', now - 2 * 60 * 60 * 1_000),
      {
        ...createReminder('invalid', now + 2_000),
        scheduledAt: 'not-an-iso-datetime',
      },
      createReminder('next', now + 5_000),
    ]);
    const timer = new SingleTimerHarness();
    const scheduler = createScheduler(source, timer, () => now);
    const events = [];
    scheduler.subscribe((event) => events.push(event));

    await scheduler.start();

    assert.equal(timer.activeCount, 1);
    assert.equal(timer.delayMs, 5_000);
    assert.equal(timer.maximumActiveCount, 1);
    assert.deepEqual(events, []);
    assert.deepEqual(source.markCompletedCalls, []);

    scheduler.stop();
    assert.equal(timer.activeCount, 0);
  });

  test('fires in order, marks each reminder complete, and schedules the following reminder', async () => {
    let now = BASE_TIME;
    const source = new FakeReminderSource([
      createReminder('first', now + 5_000),
      createReminder('second', now + 10_000),
    ]);
    const timer = new SingleTimerHarness();
    const scheduler = createScheduler(source, timer, () => now);
    const events = [];
    scheduler.subscribe((event) => events.push(event));

    await scheduler.start();
    now += 5_000;
    await timer.fire();
    await settleScheduler(scheduler);

    assert.equal(events.length, 1);
    assert.equal(events[0].type, REMINDER_EVENT_TYPES.fired);
    assert.equal(events[0].reminder.id, 'first');
    assert.equal(events[0].firedAt, '2030-01-01T12:00:05.000Z');
    assert.equal(events[0].overdue, false);
    assert.deepEqual(source.markCompletedCalls, ['first']);
    assert.equal(
      source.listReminders().find(({ id }) => id === 'first').completed,
      true,
    );
    assert.equal(timer.activeCount, 1);
    assert.equal(timer.delayMs, 5_000);

    now += 5_000;
    await timer.fire();
    await settleScheduler(scheduler);

    assert.deepEqual(
      events.map(({ reminder }) => reminder.id),
      ['first', 'second'],
    );
    assert.deepEqual(source.markCompletedCalls, ['first', 'second']);
    assert.equal(timer.activeCount, 0);
    assert.equal(timer.maximumActiveCount, 1);
  });

  test('emits recent overdue reminders on startup while ignoring stale reminders', async () => {
    let now = BASE_TIME;
    const source = new FakeReminderSource([
      createReminder('stale', now - 2 * 60 * 60 * 1_000),
      createReminder('overdue', now - 5_000),
      createReminder('future', now + 20_000),
    ]);
    const timer = new SingleTimerHarness();
    const scheduler = createScheduler(source, timer, () => now);
    const events = [];
    scheduler.subscribe((event) => events.push(event));

    await scheduler.start();
    await settleScheduler(scheduler);

    assert.deepEqual(
      events.map(({ reminder }) => reminder.id),
      ['overdue'],
    );
    assert.equal(events[0].overdue, true);
    assert.deepEqual(source.markCompletedCalls, ['overdue']);
    assert.equal(
      source.listReminders().find(({ id }) => id === 'stale').completed,
      false,
    );
    assert.equal(timer.delayMs, 20_000);
  });

  test('resynchronizes changed reminders and catches overdue work after resume', async () => {
    let now = BASE_TIME;
    const source = new FakeReminderSource([
      createReminder('later', now + 10 * 60_000),
    ]);
    const timer = new SingleTimerHarness();
    const scheduler = createScheduler(
      source,
      timer,
      () => now,
      { clockValidationIntervalMs: 60 * 60_000 },
    );
    const events = [];
    scheduler.subscribe((event) => events.push(event));

    await scheduler.start();
    assert.equal(timer.delayMs, 10 * 60_000);

    source.addReminder(createReminder('earlier', now + 30_000));
    await settleScheduler(scheduler);
    assert.equal(timer.delayMs, 30_000);
    assert.equal(timer.maximumActiveCount, 1);

    now += 31_000;
    await scheduler.resynchronize();
    await settleScheduler(scheduler);

    assert.deepEqual(
      events.map(({ reminder }) => reminder.id),
      ['earlier'],
    );
    assert.equal(events[0].overdue, true);
    assert.deepEqual(source.markCompletedCalls, ['earlier']);
  });

  test('restores after restart and detects forward clock changes through the single validation timer', async () => {
    let now = BASE_TIME;
    const source = new FakeReminderSource([
      createReminder('restored', now + 10 * 60_000),
    ]);
    const firstTimer = new SingleTimerHarness();
    const firstScheduler = createScheduler(
      source,
      firstTimer,
      () => now,
    );

    await firstScheduler.start();
    assert.equal(firstTimer.delayMs, 60_000);
    firstScheduler.stop();
    assert.equal(firstTimer.activeCount, 0);

    const restoredTimer = new SingleTimerHarness();
    const restoredScheduler = createScheduler(
      source,
      restoredTimer,
      () => now,
    );
    const events = [];
    restoredScheduler.subscribe((event) => events.push(event));

    await restoredScheduler.start();
    assert.equal(restoredTimer.delayMs, 60_000);

    now += 11 * 60_000;
    await restoredTimer.fire();
    await settleScheduler(restoredScheduler);

    assert.deepEqual(
      events.map(({ reminder }) => reminder.id),
      ['restored'],
    );
    assert.equal(events[0].overdue, true);
    assert.equal(restoredTimer.activeCount, 0);
    assert.equal(restoredTimer.maximumActiveCount, 1);
  });
});
