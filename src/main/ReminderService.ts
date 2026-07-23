import { randomUUID } from 'node:crypto';

import {
  cloneReminder,
  MAXIMUM_REMINDER_ID_LENGTH,
  MAXIMUM_REMINDER_MESSAGE_LENGTH,
  MAXIMUM_REMINDER_TITLE_LENGTH,
  parseIsoDateTime,
  type Reminder,
  type UpdateReminderInput,
} from '../shared/reminders';
import { SettingsService } from './SettingsService';

export type ReminderValidationField =
  | 'id'
  | 'title'
  | 'message'
  | 'scheduledAt'
  | 'reminder';

export class ReminderValidationError extends TypeError {
  public readonly field: ReminderValidationField;

  public constructor(field: ReminderValidationField, message: string) {
    super(message);
    this.name = 'ReminderValidationError';
    this.field = field;
  }
}

export class ReminderNotFoundError extends Error {
  public constructor() {
    super('Reminder not found.');
    this.name = 'ReminderNotFoundError';
  }
}

export interface ReminderServiceDependencies {
  readonly createId?: () => string;
  readonly now?: () => Date;
}

export type ReminderChangeListener = () => void;

const CREATE_INPUT_KEYS = ['title', 'message', 'scheduledAt'] as const;
const UPDATE_INPUT_KEYS = ['title', 'message', 'scheduledAt'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean => Object.keys(value).every((key) => allowedKeys.includes(key));

const compareReminders = (left: Reminder, right: Reminder): number => {
  const scheduledDifference =
    Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt);

  if (scheduledDifference !== 0) {
    return scheduledDifference;
  }

  const createdDifference =
    Date.parse(left.createdAt) - Date.parse(right.createdAt);

  return createdDifference !== 0
    ? createdDifference
    : left.id.localeCompare(right.id);
};

export class ReminderService {
  private readonly createId: () => string;
  private readonly listeners = new Set<ReminderChangeListener>();
  private readonly now: () => Date;
  private readonly settingsService: SettingsService;
  private operationQueue: Promise<void> = Promise.resolve();

  public constructor(
    settingsService: SettingsService,
    dependencies: ReminderServiceDependencies = {},
  ) {
    this.settingsService = settingsService;
    this.createId = dependencies.createId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date());
  }

  public createReminder(value: unknown): Promise<Reminder> {
    return this.enqueueOperation(async () => {
      const input = this.parseCreateInput(value);
      const timestamp = this.getCurrentTimestamp();
      const existingReminders = this.settingsService.get().reminders;
      const reminder: Reminder = {
        id: this.generateUniqueId(existingReminders),
        title: input.title,
        message: input.message,
        scheduledAt: input.scheduledAt,
        completed: false,
        createdAt: timestamp.iso,
        updatedAt: timestamp.iso,
      };

      await this.persist([...existingReminders, reminder]);
      return cloneReminder(reminder);
    });
  }

  public updateReminder(
    idValue: unknown,
    value: unknown,
  ): Promise<Reminder> {
    return this.enqueueOperation(async () => {
      const id = this.parseId(idValue);
      const input = this.parseUpdateInput(value);
      const reminders = this.settingsService.get().reminders;
      const index = reminders.findIndex((reminder) => reminder.id === id);

      if (index < 0) {
        throw new ReminderNotFoundError();
      }

      const currentReminder = reminders[index];

      if (currentReminder === undefined) {
        throw new ReminderNotFoundError();
      }

      const updatedReminder: Reminder = {
        ...currentReminder,
        ...input,
        updatedAt: this.getCurrentTimestamp().iso,
      };
      const updatedReminders = reminders.map((reminder, reminderIndex) =>
        reminderIndex === index ? updatedReminder : reminder,
      );

      await this.persist(updatedReminders);
      return cloneReminder(updatedReminder);
    });
  }

  public deleteReminder(idValue: unknown): Promise<boolean> {
    return this.enqueueOperation(async () => {
      const id = this.parseId(idValue);
      const reminders = this.settingsService.get().reminders;
      const updatedReminders = reminders.filter(
        (reminder) => reminder.id !== id,
      );

      if (updatedReminders.length === reminders.length) {
        return false;
      }

      await this.persist(updatedReminders);
      return true;
    });
  }

  public getReminder(idValue: unknown): Reminder | null {
    const id = this.parseId(idValue);
    const reminder = this.settingsService
      .get()
      .reminders.find((candidate) => candidate.id === id);

    return reminder === undefined ? null : cloneReminder(reminder);
  }

  public listReminders(): readonly Reminder[] {
    return this.settingsService
      .get()
      .reminders.map(cloneReminder)
      .sort(compareReminders);
  }

  public markCompleted(idValue: unknown): Promise<Reminder> {
    return this.enqueueOperation(async () => {
      const id = this.parseId(idValue);
      const reminders = this.settingsService.get().reminders;
      const index = reminders.findIndex((reminder) => reminder.id === id);

      if (index < 0) {
        throw new ReminderNotFoundError();
      }

      const currentReminder = reminders[index];

      if (currentReminder === undefined) {
        throw new ReminderNotFoundError();
      }

      if (currentReminder.completed) {
        return cloneReminder(currentReminder);
      }

      const completedReminder: Reminder = {
        ...currentReminder,
        completed: true,
        updatedAt: this.getCurrentTimestamp().iso,
      };
      const completedReminders = reminders.map(
        (reminder, reminderIndex) =>
          reminderIndex === index ? completedReminder : reminder,
      );

      await this.persist(completedReminders);
      return cloneReminder(completedReminder);
    });
  }

  public subscribe(listener: ReminderChangeListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private parseCreateInput(value: unknown): {
    readonly title: string;
    readonly message: string;
    readonly scheduledAt: string;
  } {
    if (
      !isRecord(value) ||
      !hasOnlyKeys(value, CREATE_INPUT_KEYS) ||
      !Object.hasOwn(value, 'title') ||
      !Object.hasOwn(value, 'scheduledAt')
    ) {
      throw new ReminderValidationError(
        'reminder',
        'Invalid reminder input.',
      );
    }

    return {
      title: this.parseTitle(value.title),
      message: this.parseMessage(value.message),
      scheduledAt: this.parseScheduledAt(value.scheduledAt),
    };
  }

  private parseUpdateInput(value: unknown): UpdateReminderInput {
    if (
      !isRecord(value) ||
      !hasOnlyKeys(value, UPDATE_INPUT_KEYS) ||
      Object.keys(value).length === 0
    ) {
      throw new ReminderValidationError(
        'reminder',
        'Invalid reminder update.',
      );
    }

    return {
      ...(Object.hasOwn(value, 'title')
        ? { title: this.parseTitle(value.title) }
        : {}),
      ...(Object.hasOwn(value, 'message')
        ? { message: this.parseMessage(value.message) }
        : {}),
      ...(Object.hasOwn(value, 'scheduledAt')
        ? { scheduledAt: this.parseScheduledAt(value.scheduledAt) }
        : {}),
    };
  }

  private parseId(value: unknown): string {
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      value.length > MAXIMUM_REMINDER_ID_LENGTH ||
      value.trim() !== value
    ) {
      throw new ReminderValidationError('id', 'Invalid reminder ID.');
    }

    return value;
  }

  private parseTitle(value: unknown): string {
    if (typeof value !== 'string') {
      throw new ReminderValidationError(
        'title',
        'Reminder title is required.',
      );
    }

    const title = value.trim();

    if (title.length === 0) {
      throw new ReminderValidationError(
        'title',
        'Reminder title is required.',
      );
    }

    if (title.length > MAXIMUM_REMINDER_TITLE_LENGTH) {
      throw new ReminderValidationError(
        'title',
        `Reminder title must not exceed ${MAXIMUM_REMINDER_TITLE_LENGTH} characters.`,
      );
    }

    return title;
  }

  private parseMessage(value: unknown): string {
    if (value === undefined) {
      return '';
    }

    if (typeof value !== 'string') {
      throw new ReminderValidationError(
        'message',
        'Reminder message must be text.',
      );
    }

    const message = value.trim();

    if (message.length > MAXIMUM_REMINDER_MESSAGE_LENGTH) {
      throw new ReminderValidationError(
        'message',
        `Reminder message must not exceed ${MAXIMUM_REMINDER_MESSAGE_LENGTH} characters.`,
      );
    }

    return message;
  }

  private parseScheduledAt(value: unknown): string {
    const scheduledAt = parseIsoDateTime(value);

    if (scheduledAt === null) {
      throw new ReminderValidationError(
        'scheduledAt',
        'Reminder date must be a valid ISO-8601 datetime.',
      );
    }

    if (scheduledAt.timestamp < this.getCurrentTimestamp().timestamp) {
      throw new ReminderValidationError(
        'scheduledAt',
        'Reminder date must not be in the past.',
      );
    }

    return scheduledAt.iso;
  }

  private generateUniqueId(reminders: readonly Reminder[]): string {
    const existingIds = new Set(reminders.map((reminder) => reminder.id));

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = this.parseId(this.createId());

      if (!existingIds.has(candidate)) {
        return candidate;
      }
    }

    throw new Error('Unable to create a unique reminder ID.');
  }

  private getCurrentTimestamp(): {
    readonly iso: string;
    readonly timestamp: number;
  } {
    const date = this.now();
    const timestamp = date.getTime();

    if (!Number.isFinite(timestamp)) {
      throw new Error('Reminder clock returned an invalid date.');
    }

    return {
      iso: date.toISOString(),
      timestamp,
    };
  }

  private async persist(reminders: readonly Reminder[]): Promise<void> {
    const sortedReminders = reminders
      .map(cloneReminder)
      .sort(compareReminders);

    await this.settingsService.update({ reminders: sortedReminders });
    this.notifyListeners();
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error('[reminders] listener_failed', error);
      }
    }
  }

  private enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
