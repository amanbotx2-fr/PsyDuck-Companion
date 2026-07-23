export const REMINDER_RECURRENCE_TYPES = [
  'none',
  'hourly',
  'daily',
  'weekly',
  'monthly',
  'interval',
] as const;

export const REMINDER_INTERVAL_UNITS = [
  'minutes',
  'hours',
  'days',
] as const;

export const MINIMUM_REMINDER_INTERVAL_VALUE = 1;
export const MAXIMUM_REMINDER_INTERVAL_VALUE = 100_000;

export type ReminderRecurrenceType =
  (typeof REMINDER_RECURRENCE_TYPES)[number];
export type ReminderIntervalUnit =
  (typeof REMINDER_INTERVAL_UNITS)[number];

export type ReminderRecurrence =
  | { readonly type: 'none' }
  | { readonly type: 'hourly' }
  | { readonly type: 'daily' }
  | { readonly type: 'weekly' }
  | { readonly type: 'monthly' }
  | {
      readonly type: 'interval';
      readonly unit: ReminderIntervalUnit;
      readonly value: number;
    };

export const NO_REMINDER_RECURRENCE = {
  type: 'none',
} as const satisfies ReminderRecurrence;

const MILLISECONDS_PER_MINUTE = 60_000;
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;
const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean => Object.keys(value).every((key) => allowedKeys.includes(key));

export const isReminderIntervalUnit = (
  value: unknown,
): value is ReminderIntervalUnit =>
  typeof value === 'string' &&
  REMINDER_INTERVAL_UNITS.some((unit) => unit === value);

export const isReminderRecurrenceType = (
  value: unknown,
): value is ReminderRecurrenceType =>
  typeof value === 'string' &&
  REMINDER_RECURRENCE_TYPES.some((type) => type === value);

export const isReminderIntervalValue = (
  value: unknown,
): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= MINIMUM_REMINDER_INTERVAL_VALUE &&
  value <= MAXIMUM_REMINDER_INTERVAL_VALUE;

export const parseReminderRecurrence = (
  value: unknown,
): ReminderRecurrence | null => {
  if (
    !isRecord(value) ||
    !isReminderRecurrenceType(value.type)
  ) {
    return null;
  }

  if (value.type === 'interval') {
    if (
      !hasOnlyKeys(value, ['type', 'unit', 'value']) ||
      !Object.hasOwn(value, 'unit') ||
      !Object.hasOwn(value, 'value') ||
      !isReminderIntervalUnit(value.unit) ||
      !isReminderIntervalValue(value.value)
    ) {
      return null;
    }

    return {
      type: 'interval',
      unit: value.unit,
      value: value.value,
    };
  }

  return hasOnlyKeys(value, ['type'])
    ? { type: value.type }
    : null;
};

export const cloneReminderRecurrence = (
  recurrence: ReminderRecurrence,
): ReminderRecurrence =>
  recurrence.type === 'interval'
    ? {
        type: 'interval',
        unit: recurrence.unit,
        value: recurrence.value,
      }
    : { type: recurrence.type };

export const areReminderRecurrencesEqual = (
  left: ReminderRecurrence,
  right: ReminderRecurrence,
): boolean =>
  left.type === right.type &&
  (left.type !== 'interval' ||
    (right.type === 'interval' &&
      left.unit === right.unit &&
      left.value === right.value));

export const isRecurringReminder = (
  recurrence: ReminderRecurrence,
): boolean => recurrence.type !== 'none';

export const formatReminderRecurrence = (
  recurrence: ReminderRecurrence,
): string | null => {
  switch (recurrence.type) {
    case 'none':
      return null;
    case 'hourly':
      return 'Repeats Hourly';
    case 'daily':
      return 'Repeats Daily';
    case 'weekly':
      return 'Repeats Weekly';
    case 'monthly':
      return 'Repeats Monthly';
    case 'interval': {
      const singularUnit = recurrence.unit.slice(0, -1);
      const unit =
        recurrence.value === 1 ? singularUnit : recurrence.unit;
      return `Every ${recurrence.value} ${
        unit.charAt(0).toUpperCase() + unit.slice(1)
      }`;
    }
  }
};

const parseDate = (value: string, field: string): Date => {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    throw new TypeError(`${field} must be a valid datetime.`);
  }

  return date;
};

const addCalendarDays = (
  current: Date,
  intervalDays: number,
  afterTimestamp: number,
): Date => {
  const elapsedTime = Math.max(0, afterTimestamp - current.getTime());
  const estimatedIntervals = Math.max(
    1,
    Math.floor(elapsedTime / (MILLISECONDS_PER_DAY * intervalDays)),
  );
  const next = new Date(current);
  next.setDate(
    current.getDate() + estimatedIntervals * intervalDays,
  );

  while (
    next.getTime() <= current.getTime() ||
    next.getTime() <= afterTimestamp
  ) {
    next.setDate(next.getDate() + intervalDays);
  }

  return next;
};

const createMonthlyCandidate = (
  current: Date,
  monthOffset: number,
  anchorDay: number,
): Date => {
  const candidate = new Date(current);
  candidate.setDate(1);
  candidate.setMonth(candidate.getMonth() + monthOffset);
  const lastDayOfMonth = new Date(
    candidate.getFullYear(),
    candidate.getMonth() + 1,
    0,
  ).getDate();
  candidate.setDate(Math.min(anchorDay, lastDayOfMonth));
  return candidate;
};

const addCalendarMonths = (
  current: Date,
  anchor: Date,
  afterTimestamp: number,
): Date => {
  const after = new Date(afterTimestamp);
  const estimatedMonthOffset = Math.max(
    1,
    (after.getFullYear() - current.getFullYear()) * 12 +
      after.getMonth() -
      current.getMonth(),
  );
  let monthOffset = estimatedMonthOffset;
  let next = createMonthlyCandidate(
    current,
    monthOffset,
    anchor.getDate(),
  );

  while (
    next.getTime() <= current.getTime() ||
    next.getTime() <= afterTimestamp
  ) {
    monthOffset += 1;
    next = createMonthlyCandidate(
      current,
      monthOffset,
      anchor.getDate(),
    );
  }

  return next;
};

const getFixedIntervalMilliseconds = (
  recurrence: ReminderRecurrence,
): number | null => {
  if (recurrence.type === 'hourly') {
    return MILLISECONDS_PER_HOUR;
  }

  if (recurrence.type !== 'interval') {
    return null;
  }

  if (recurrence.unit === 'minutes') {
    return recurrence.value * MILLISECONDS_PER_MINUTE;
  }

  return recurrence.unit === 'hours'
    ? recurrence.value * MILLISECONDS_PER_HOUR
    : null;
};

export const calculateNextReminderOccurrence = (
  recurrenceValue: ReminderRecurrence,
  currentOccurrence: string,
  afterTimestamp = Date.now(),
  anchorScheduledAt = currentOccurrence,
): string => {
  const recurrence = parseReminderRecurrence(recurrenceValue);

  if (recurrence === null || recurrence.type === 'none') {
    throw new TypeError(
      'A valid recurring reminder configuration is required.',
    );
  }

  if (!Number.isFinite(afterTimestamp)) {
    throw new TypeError('Reminder recurrence clock must be valid.');
  }

  const current = parseDate(currentOccurrence, 'Current occurrence');
  const anchor = parseDate(anchorScheduledAt, 'Recurrence anchor');
  const fixedInterval = getFixedIntervalMilliseconds(recurrence);
  let next: Date;

  if (fixedInterval !== null) {
    const elapsedTime = afterTimestamp - current.getTime();
    const intervalCount = Math.max(
      1,
      Math.floor(elapsedTime / fixedInterval) + 1,
    );
    next = new Date(
      current.getTime() + intervalCount * fixedInterval,
    );
  } else if (
    recurrence.type === 'daily' ||
    recurrence.type === 'weekly' ||
    (recurrence.type === 'interval' && recurrence.unit === 'days')
  ) {
    const intervalDays =
      recurrence.type === 'daily'
        ? 1
        : recurrence.type === 'weekly'
          ? 7
          : recurrence.value;
    next = addCalendarDays(current, intervalDays, afterTimestamp);
  } else {
    next = addCalendarMonths(current, anchor, afterTimestamp);
  }

  if (!Number.isFinite(next.getTime())) {
    throw new RangeError(
      'The next reminder occurrence is outside the supported date range.',
    );
  }

  return next.toISOString();
};
