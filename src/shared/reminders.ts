export const MAXIMUM_REMINDER_TITLE_LENGTH = 60;
export const MAXIMUM_REMINDER_MESSAGE_LENGTH = 250;
export const MAXIMUM_REMINDER_ID_LENGTH = 128;
export const REMINDER_SNOOZE_DURATION_MS = 5 * 60 * 1_000;

export interface Reminder {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly scheduledAt: string;
  readonly completed: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateReminderInput {
  readonly title: string;
  readonly message?: string;
  readonly scheduledAt: string;
}

export interface ReminderFiredNotification {
  readonly reminder: Reminder;
  readonly firedAt: string;
  readonly overdue: boolean;
}

export interface UpdateReminderInput {
  readonly title?: string;
  readonly message?: string;
  readonly scheduledAt?: string;
}

export interface ParsedIsoDateTime {
  readonly iso: string;
  readonly timestamp: number;
}

const REMINDER_KEYS = [
  'id',
  'title',
  'message',
  'scheduledAt',
  'completed',
  'createdAt',
  'updatedAt',
] as const;

const ISO_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean => Object.keys(value).every((key) => allowedKeys.includes(key));

export const parseIsoDateTime = (
  value: unknown,
): ParsedIsoDateTime | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const match = ISO_DATE_TIME_PATTERN.exec(value);

  if (match === null) {
    return null;
  }

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fractionText = '',
    zoneText,
    offsetSign,
    offsetHourText = '0',
    offsetMinuteText = '0',
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(`${fractionText}000`.slice(0, 3));
  const offsetHour = Number(offsetHourText);
  const offsetMinute = Number(offsetMinuteText);

  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return null;
  }

  const localDate = new Date(0);
  localDate.setUTCFullYear(year, month - 1, day);
  localDate.setUTCHours(hour, minute, second, millisecond);

  if (
    localDate.getUTCFullYear() !== year ||
    localDate.getUTCMonth() !== month - 1 ||
    localDate.getUTCDate() !== day ||
    localDate.getUTCHours() !== hour ||
    localDate.getUTCMinutes() !== minute ||
    localDate.getUTCSeconds() !== second
  ) {
    return null;
  }

  const offsetMinutes =
    zoneText === 'Z'
      ? 0
      : (offsetHour * 60 + offsetMinute) *
        (offsetSign === '+' ? 1 : -1);
  const timestamp =
    localDate.getTime() - offsetMinutes * 60 * 1_000;

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return {
    iso: new Date(timestamp).toISOString(),
    timestamp,
  };
};

export const cloneReminder = (reminder: Reminder): Reminder => ({
  ...reminder,
});

export const createSnoozedReminderInput = (
  reminder: Reminder,
  nowTimestamp = Date.now(),
): CreateReminderInput => {
  if (!Number.isFinite(nowTimestamp)) {
    throw new TypeError('Reminder snooze clock must be valid.');
  }

  return {
    title: reminder.title,
    message: reminder.message,
    scheduledAt: new Date(
      nowTimestamp + REMINDER_SNOOZE_DURATION_MS,
    ).toISOString(),
  };
};

export const parseStoredReminder = (value: unknown): Reminder | null => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, REMINDER_KEYS) ||
    REMINDER_KEYS.some((key) => !Object.hasOwn(value, key)) ||
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    value.id.length > MAXIMUM_REMINDER_ID_LENGTH ||
    value.id.trim() !== value.id ||
    typeof value.title !== 'string' ||
    value.title.length === 0 ||
    value.title.length > MAXIMUM_REMINDER_TITLE_LENGTH ||
    value.title.trim() !== value.title ||
    typeof value.message !== 'string' ||
    value.message.length > MAXIMUM_REMINDER_MESSAGE_LENGTH ||
    value.message.trim() !== value.message ||
    typeof value.completed !== 'boolean'
  ) {
    return null;
  }

  const scheduledAt = parseIsoDateTime(value.scheduledAt);
  const createdAt = parseIsoDateTime(value.createdAt);
  const updatedAt = parseIsoDateTime(value.updatedAt);

  if (
    scheduledAt === null ||
    createdAt === null ||
    updatedAt === null ||
    updatedAt.timestamp < createdAt.timestamp
  ) {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    message: value.message,
    scheduledAt: scheduledAt.iso,
    completed: value.completed,
    createdAt: createdAt.iso,
    updatedAt: updatedAt.iso,
  };
};

export const parseStoredReminders = (
  value: unknown,
): readonly Reminder[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const reminders: Reminder[] = [];
  const ids = new Set<string>();

  for (const candidate of value) {
    const reminder = parseStoredReminder(candidate);

    if (reminder === null || ids.has(reminder.id)) {
      return null;
    }

    ids.add(reminder.id);
    reminders.push(reminder);
  }

  return reminders;
};
