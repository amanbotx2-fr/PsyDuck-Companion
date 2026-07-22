export const DEFAULT_WATER_REMINDER_INTERVAL_MINUTES = 30;
export const WATER_REMINDER_STORAGE_KEY =
  'psyduck.water-reminder.preferences';

export const WATER_REMINDER_MESSAGES = [
  '💧 Time to drink some water.',
  'Stay hydrated!',
  'Hydration break 💧',
  'Water first, code later.',
] as const;

const MILLISECONDS_PER_MINUTE = 60_000;
const MAXIMUM_TIMER_DELAY_MS = 2_147_483_647;
const PREFERENCE_VERSION = 1;

export interface WaterReminderStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

export interface WaterReminderScheduler {
  readonly schedule: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof globalThis.setTimeout>;
  readonly cancel: (
    timerId: ReturnType<typeof globalThis.setTimeout>,
  ) => void;
}

export type WaterReminderErrorOperation =
  | 'load_preferences'
  | 'save_preferences'
  | 'select_message'
  | 'show_message';

export interface WaterReminderOptions {
  readonly showMessage: (message: string) => unknown;
  readonly storage?: WaterReminderStorage;
  readonly scheduler?: WaterReminderScheduler;
  readonly random?: () => number;
  readonly intervalOverrideMs?: number;
  readonly onError?: (
    error: unknown,
    operation: WaterReminderErrorOperation,
  ) => void;
}

interface StoredWaterReminderPreferences {
  readonly version: typeof PREFERENCE_VERSION;
  readonly enabled: boolean;
  readonly intervalMinutes: number;
}

const DEFAULT_SCHEDULER: WaterReminderScheduler = {
  schedule: (callback, delayMs) =>
    globalThis.setTimeout(callback, delayMs),
  cancel: (timerId) => {
    globalThis.clearTimeout(timerId);
  },
};

const getDefaultStorage = (): WaterReminderStorage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isValidIntervalMinutes = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value > 0 &&
  value * MILLISECONDS_PER_MINUTE <= MAXIMUM_TIMER_DELAY_MS;

const isStoredPreferences = (
  value: unknown,
): value is StoredWaterReminderPreferences =>
  isRecord(value) &&
  value.version === PREFERENCE_VERSION &&
  typeof value.enabled === 'boolean' &&
  isValidIntervalMinutes(value.intervalMinutes);

export class WaterReminder {
  private readonly showMessage: (message: string) => unknown;
  private readonly storage: WaterReminderStorage | undefined;
  private readonly scheduler: WaterReminderScheduler;
  private readonly random: () => number;
  private readonly intervalOverrideMs: number | undefined;
  private readonly onError:
    | ((
        error: unknown,
        operation: WaterReminderErrorOperation,
      ) => void)
    | undefined;
  private reminderTimerId: ReturnType<typeof globalThis.setTimeout> | null =
    null;
  private enabled = true;
  private intervalMinutes = DEFAULT_WATER_REMINDER_INTERVAL_MINUTES;
  private running = false;

  public constructor(options: WaterReminderOptions) {
    if (
      options.intervalOverrideMs !== undefined &&
      (!Number.isFinite(options.intervalOverrideMs) ||
        options.intervalOverrideMs <= 0 ||
        options.intervalOverrideMs > MAXIMUM_TIMER_DELAY_MS)
    ) {
      throw new RangeError(
        'The water reminder interval override must be a valid timer delay.',
      );
    }

    this.showMessage = options.showMessage;
    this.storage = options.storage ?? getDefaultStorage();
    this.scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
    this.random = options.random ?? Math.random;
    this.intervalOverrideMs = options.intervalOverrideMs;
    this.onError = options.onError;
    this.loadPreferences();
  }

  public get isRunning(): boolean {
    return this.running;
  }

  public get isEnabled(): boolean {
    return this.enabled;
  }

  public get configuredIntervalMinutes(): number {
    return this.intervalMinutes;
  }

  public start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.scheduleNextReminder();
  }

  public stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    this.cancelScheduledReminder();
  }

  public enable(): void {
    if (this.enabled) {
      return;
    }

    this.enabled = true;
    this.savePreferences();
    this.scheduleNextReminder();
  }

  public disable(): void {
    if (!this.enabled) {
      return;
    }

    this.enabled = false;
    this.cancelScheduledReminder();
    this.savePreferences();
  }

  public setInterval(minutes: number): void {
    if (!isValidIntervalMinutes(minutes)) {
      throw new RangeError(
        'The water reminder interval must be a positive number of minutes within the supported timer range.',
      );
    }

    if (minutes === this.intervalMinutes) {
      return;
    }

    this.intervalMinutes = minutes;
    this.savePreferences();
    this.scheduleNextReminder();
  }

  private readonly handleReminderDeadline = (): void => {
    this.reminderTimerId = null;

    if (!this.running || !this.enabled) {
      return;
    }

    try {
      this.showMessage(this.selectMessage());
    } catch (error) {
      this.onError?.(error, 'show_message');
    } finally {
      this.scheduleNextReminder();
    }
  };

  private scheduleNextReminder(): void {
    this.cancelScheduledReminder();

    if (!this.running || !this.enabled) {
      return;
    }

    const delayMs =
      this.intervalOverrideMs ??
      this.intervalMinutes * MILLISECONDS_PER_MINUTE;
    this.reminderTimerId = this.scheduler.schedule(
      this.handleReminderDeadline,
      delayMs,
    );
  }

  private cancelScheduledReminder(): void {
    if (this.reminderTimerId === null) {
      return;
    }

    this.scheduler.cancel(this.reminderTimerId);
    this.reminderTimerId = null;
  }

  private selectMessage(): string {
    let randomValue = 0;

    try {
      const candidate = this.random();
      randomValue = Number.isFinite(candidate)
        ? Math.min(Math.max(candidate, 0), 1)
        : 0;
    } catch (error) {
      this.onError?.(error, 'select_message');
    }

    const messageIndex = Math.min(
      Math.floor(randomValue * WATER_REMINDER_MESSAGES.length),
      WATER_REMINDER_MESSAGES.length - 1,
    );

    return (
      WATER_REMINDER_MESSAGES[messageIndex] ??
      WATER_REMINDER_MESSAGES[0]
    );
  }

  private loadPreferences(): void {
    if (this.storage === undefined) {
      return;
    }

    try {
      const serializedPreferences = this.storage.getItem(
        WATER_REMINDER_STORAGE_KEY,
      );

      if (serializedPreferences === null) {
        return;
      }

      const preferences: unknown = JSON.parse(serializedPreferences);

      if (!isStoredPreferences(preferences)) {
        return;
      }

      this.enabled = preferences.enabled;
      this.intervalMinutes = preferences.intervalMinutes;
    } catch (error) {
      this.onError?.(error, 'load_preferences');
    }
  }

  private savePreferences(): void {
    if (this.storage === undefined) {
      return;
    }

    const preferences: StoredWaterReminderPreferences = {
      version: PREFERENCE_VERSION,
      enabled: this.enabled,
      intervalMinutes: this.intervalMinutes,
    };

    try {
      this.storage.setItem(
        WATER_REMINDER_STORAGE_KEY,
        JSON.stringify(preferences),
      );
    } catch (error) {
      this.onError?.(error, 'save_preferences');
    }
  }
}
