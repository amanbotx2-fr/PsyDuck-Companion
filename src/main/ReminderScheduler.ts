import {
  cloneReminder,
  parseStoredReminder,
  type Reminder,
} from '../shared/reminders';
import {
  REMINDER_EVENT_TYPES,
  ReminderEventBus,
  type ReminderEventListener,
} from './ReminderEvents';
import type {
  ReminderChangeListener,
  ReminderService,
} from './ReminderService';

export const REMINDER_CLOCK_VALIDATION_INTERVAL_MS = 60_000;
export const REMINDER_MAXIMUM_OVERDUE_AGE_MS = 24 * 60 * 60 * 1_000;

export interface ReminderSchedulerTimer {
  readonly schedule: (
    callback: () => void | Promise<void>,
    delayMs: number,
  ) => unknown;
  readonly cancel: (handle: unknown) => void;
}

export interface ReminderSchedulerSource {
  readonly listReminders: () => readonly Reminder[];
  readonly markCompleted: (id: string) => Promise<Reminder>;
  readonly subscribe: (listener: ReminderChangeListener) => () => void;
}

export interface ReminderSchedulerDependencies {
  readonly clockValidationIntervalMs?: number;
  readonly eventBus?: ReminderEventBus;
  readonly maximumOverdueAgeMs?: number;
  readonly now?: () => number;
  readonly timer?: ReminderSchedulerTimer;
}

interface ScheduledReminder {
  readonly reminder: Reminder;
  readonly timestamp: number;
}

const NATIVE_TIMER: ReminderSchedulerTimer = {
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

const isPositiveFiniteNumber = (value: number): boolean =>
  Number.isFinite(value) && value > 0;

const compareScheduledReminders = (
  left: ScheduledReminder,
  right: ScheduledReminder,
): number =>
  left.timestamp - right.timestamp ||
  left.reminder.id.localeCompare(right.reminder.id);

export class ReminderScheduler {
  private readonly clockValidationIntervalMs: number;
  private readonly eventBus: ReminderEventBus;
  private readonly firedReminderIds = new Set<string>();
  private readonly maximumOverdueAgeMs: number;
  private readonly now: () => number;
  private readonly reminderService: ReminderSchedulerSource;
  private readonly timer: ReminderSchedulerTimer;
  private lifecycleVersion = 0;
  private operationQueue: Promise<void> = Promise.resolve();
  private running = false;
  private synchronizationQueued = false;
  private timerHandle: unknown | null = null;
  private unsubscribeFromReminderChanges: (() => void) | null = null;

  public constructor(
    reminderService: ReminderService | ReminderSchedulerSource,
    dependencies: ReminderSchedulerDependencies = {},
  ) {
    const clockValidationIntervalMs =
      dependencies.clockValidationIntervalMs ??
      REMINDER_CLOCK_VALIDATION_INTERVAL_MS;
    const maximumOverdueAgeMs =
      dependencies.maximumOverdueAgeMs ??
      REMINDER_MAXIMUM_OVERDUE_AGE_MS;

    if (!isPositiveFiniteNumber(clockValidationIntervalMs)) {
      throw new TypeError(
        'Reminder clock validation interval must be positive.',
      );
    }

    if (!isPositiveFiniteNumber(maximumOverdueAgeMs)) {
      throw new TypeError(
        'Reminder overdue age limit must be positive.',
      );
    }

    this.clockValidationIntervalMs = clockValidationIntervalMs;
    this.eventBus = dependencies.eventBus ?? new ReminderEventBus();
    this.maximumOverdueAgeMs = maximumOverdueAgeMs;
    this.now = dependencies.now ?? Date.now;
    this.reminderService = reminderService;
    this.timer = dependencies.timer ?? NATIVE_TIMER;
  }

  public start(): Promise<void> {
    if (this.running) {
      return this.operationQueue;
    }

    this.running = true;
    this.lifecycleVersion += 1;
    this.unsubscribeFromReminderChanges = this.reminderService.subscribe(
      () => {
        void this.resynchronize();
      },
    );

    return this.resynchronize();
  }

  public stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    this.lifecycleVersion += 1;
    this.clearTimer();
    this.unsubscribeFromReminderChanges?.();
    this.unsubscribeFromReminderChanges = null;
  }

  public resynchronize(): Promise<void> {
    if (!this.running) {
      return Promise.resolve();
    }

    this.clearTimer();

    if (this.synchronizationQueued) {
      return this.operationQueue;
    }

    this.synchronizationQueued = true;
    const lifecycleVersion = this.lifecycleVersion;
    const operation = this.operationQueue.then(async () => {
      this.synchronizationQueued = false;

      if (!this.running || lifecycleVersion !== this.lifecycleVersion) {
        return;
      }

      await this.synchronize(lifecycleVersion);
    });

    this.operationQueue = operation.catch(() => undefined);
    return operation;
  }

  public subscribe(listener: ReminderEventListener): () => void {
    return this.eventBus.subscribe(listener);
  }

  private async synchronize(lifecycleVersion: number): Promise<void> {
    this.clearTimer();

    try {
      const now = this.getCurrentTimestamp();
      const candidates = this.loadCandidates();
      this.pruneFiredReminderIds(candidates);
      const dueReminders = candidates.filter(
        ({ timestamp }) =>
          timestamp <= now &&
          now - timestamp <= this.maximumOverdueAgeMs,
      );

      for (const candidate of dueReminders) {
        if (
          !this.running ||
          lifecycleVersion !== this.lifecycleVersion
        ) {
          return;
        }

        await this.fireReminder(candidate, now);
      }

      if (
        !this.running ||
        lifecycleVersion !== this.lifecycleVersion
      ) {
        return;
      }

      this.scheduleNextWake(this.getCurrentTimestamp());
    } catch (error) {
      console.error('[reminder-scheduler] synchronization_failed', error);

      if (
        this.running &&
        lifecycleVersion === this.lifecycleVersion
      ) {
        this.scheduleTimer(this.clockValidationIntervalMs);
      }
    }
  }

  private async fireReminder(
    candidate: ScheduledReminder,
    firedTimestamp: number,
  ): Promise<void> {
    const { reminder, timestamp } = candidate;

    if (!this.firedReminderIds.has(reminder.id)) {
      this.eventBus.emit({
        type: REMINDER_EVENT_TYPES.fired,
        reminder: cloneReminder(reminder),
        firedAt: new Date(firedTimestamp).toISOString(),
        overdue: timestamp < firedTimestamp,
      });
      this.firedReminderIds.add(reminder.id);
    }

    try {
      await this.reminderService.markCompleted(reminder.id);
      this.firedReminderIds.delete(reminder.id);
    } catch (error) {
      // Do not emit the same event repeatedly if persistence is temporarily
      // unavailable. The next validation pass retries completion only.
      console.error(
        '[reminder-scheduler] completion_failed',
        reminder.id,
        error,
      );
    }
  }

  private loadCandidates(): readonly ScheduledReminder[] {
    const candidates: ScheduledReminder[] = [];

    for (const value of this.reminderService.listReminders()) {
      const reminder = parseStoredReminder(value);

      if (reminder === null || reminder.completed) {
        continue;
      }

      const occurrence = reminder.nextOccurrence;

      if (occurrence === null) {
        continue;
      }

      const timestamp = Date.parse(occurrence);

      if (!Number.isFinite(timestamp)) {
        continue;
      }

      candidates.push({ reminder, timestamp });
    }

    return candidates.sort(compareScheduledReminders);
  }

  private pruneFiredReminderIds(
    candidates: readonly ScheduledReminder[],
  ): void {
    const candidateIds = new Set(
      candidates.map(({ reminder }) => reminder.id),
    );

    for (const id of this.firedReminderIds) {
      if (!candidateIds.has(id)) {
        this.firedReminderIds.delete(id);
      }
    }
  }

  private scheduleNextWake(now: number): void {
    const candidates = this.loadCandidates();
    this.pruneFiredReminderIds(candidates);
    const pendingDueReminder = candidates.find(
      ({ timestamp }) =>
        timestamp <= now &&
        now - timestamp <= this.maximumOverdueAgeMs,
    );

    if (pendingDueReminder !== undefined) {
      this.scheduleTimer(this.clockValidationIntervalMs);
      return;
    }

    const nextReminder = candidates.find(({ timestamp }) => timestamp > now);

    if (nextReminder === undefined) {
      if (candidates.length > 0) {
        this.scheduleTimer(this.clockValidationIntervalMs);
      }

      return;
    }

    this.scheduleTimer(
      Math.min(
        nextReminder.timestamp - now,
        this.clockValidationIntervalMs,
      ),
    );
  }

  private scheduleTimer(delayMs: number): void {
    this.clearTimer();
    const lifecycleVersion = this.lifecycleVersion;

    this.timerHandle = this.timer.schedule(() => {
      this.timerHandle = null;

      if (
        !this.running ||
        lifecycleVersion !== this.lifecycleVersion
      ) {
        return;
      }

      return this.resynchronize();
    }, Math.max(0, delayMs));
  }

  private clearTimer(): void {
    if (this.timerHandle === null) {
      return;
    }

    this.timer.cancel(this.timerHandle);
    this.timerHandle = null;
  }

  private getCurrentTimestamp(): number {
    const timestamp = this.now();

    if (!Number.isFinite(timestamp)) {
      throw new Error('Reminder scheduler clock returned an invalid time.');
    }

    return timestamp;
  }
}
