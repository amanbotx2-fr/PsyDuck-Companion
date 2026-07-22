import {
  DEFAULT_PERSONALITY_MESSAGES,
  PersonalityService,
} from '../personality';

export const DEFAULT_WATER_REMINDER_INTERVAL_MINUTES = 30;
export const WATER_REMINDER_STORAGE_KEY =
  'psyduck.water-reminder.preferences';

export const WATER_REMINDER_MESSAGES =
  DEFAULT_PERSONALITY_MESSAGES.hydration;

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
  readonly debug?: boolean;
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
  private readonly personality: PersonalityService;
  private readonly onError:
    | ((
        error: unknown,
        operation: WaterReminderErrorOperation,
      ) => void)
    | undefined;
  private reminderTimerId: ReturnType<typeof globalThis.setTimeout> | null =
    null;
  private scheduleGeneration = 0;
  private enabled = true;
  private intervalMinutes = DEFAULT_WATER_REMINDER_INTERVAL_MINUTES;
  private running = false;
  private readonly debug: boolean;

  public constructor(options: WaterReminderOptions) {
    this.showMessage = options.showMessage;
    this.storage = options.storage ?? getDefaultStorage();
    this.scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
    this.personality = new PersonalityService(
      options.random === undefined ? {} : { random: options.random },
    );
    this.onError = options.onError;
    this.debug = options.debug ?? false;
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
      if (this.reminderTimerId === null) {
        this.scheduleNextReminder();
      }

      this.log('start_ignored', { reason: 'already_running' });
      return;
    }

    this.running = true;
    this.log('started');
    this.scheduleNextReminder();
  }

  public stop(): void {
    this.running = false;
    this.cancelScheduledReminder();
    this.log('stopped');
  }

  public enable(): void {
    if (this.enabled) {
      if (this.running && this.reminderTimerId === null) {
        this.scheduleNextReminder();
      }

      return;
    }

    this.enabled = true;
    this.savePreferences();
    this.log('enabled');
    this.scheduleNextReminder();
  }

  public disable(): void {
    if (!this.enabled) {
      return;
    }

    this.enabled = false;
    this.cancelScheduledReminder();
    this.savePreferences();
    this.log('disabled');
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
    this.log('interval_changed', { intervalMinutes: minutes });
    this.scheduleNextReminder();
  }

  private handleReminderDeadline(generation: number): void {
    if (generation !== this.scheduleGeneration) {
      this.log('stale_deadline_ignored', { generation });
      return;
    }

    this.reminderTimerId = null;

    if (!this.running || !this.enabled) {
      this.log('deadline_ignored', {
        enabled: this.enabled,
        running: this.running,
      });
      return;
    }

    this.log('deadline_reached', { generation });

    try {
      this.showMessage(this.selectMessage());
    } catch (error) {
      this.onError?.(error, 'show_message');
    } finally {
      this.scheduleNextReminder();
    }
  }

  private scheduleNextReminder(): void {
    this.cancelScheduledReminder();

    if (!this.running || !this.enabled) {
      return;
    }

    const delayMs = this.intervalMinutes * MILLISECONDS_PER_MINUTE;
    const generation = this.scheduleGeneration;
    this.reminderTimerId = this.scheduler.schedule(
      () => {
        this.handleReminderDeadline(generation);
      },
      delayMs,
    );
    this.log('scheduled', {
      delayMs,
      generation,
      intervalMinutes: this.intervalMinutes,
    });
  }

  private cancelScheduledReminder(): void {
    this.scheduleGeneration += 1;

    if (this.reminderTimerId === null) {
      return;
    }

    this.scheduler.cancel(this.reminderTimerId);
    this.reminderTimerId = null;
    this.log('cancelled', { generation: this.scheduleGeneration });
  }

  private log(
    event: string,
    details: Readonly<Record<string, boolean | number | string>> = {},
  ): void {
    if (!this.debug) {
      return;
    }

    console.debug('[water-reminder]', event, details);
  }

  private selectMessage(): string {
    try {
      return this.personality.getHydrationMessage();
    } catch (error) {
      this.onError?.(error, 'select_message');
      return WATER_REMINDER_MESSAGES[0];
    }
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
