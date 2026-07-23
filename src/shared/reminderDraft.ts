export const DEFAULT_REMINDER_LEAD_TIME_MS = 30 * 60 * 1_000;
export const REMINDER_TIME_STEP_MINUTES = 5;

export interface ReminderLocalSchedule {
  readonly date: string;
  readonly time: string;
}

const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_INPUT_PATTERN = /^(\d{2}):(\d{2})$/;

const padTwoDigits = (value: number): string =>
  String(value).padStart(2, '0');

const formatLocalDate = (date: Date): string =>
  [
    String(date.getFullYear()).padStart(4, '0'),
    padTwoDigits(date.getMonth() + 1),
    padTwoDigits(date.getDate()),
  ].join('-');

const formatLocalTime = (date: Date): string =>
  `${padTwoDigits(date.getHours())}:${padTwoDigits(date.getMinutes())}`;

export const formatReminderLocalSchedule = (
  scheduledAt: string,
): ReminderLocalSchedule | null => {
  const scheduledDate = new Date(scheduledAt);

  if (!Number.isFinite(scheduledDate.getTime())) {
    return null;
  }

  return {
    date: formatLocalDate(scheduledDate),
    time: formatLocalTime(scheduledDate),
  };
};

export const areReminderLocalSchedulesEqual = (
  leftScheduledAt: string,
  rightScheduledAt: string,
): boolean => {
  const left = formatReminderLocalSchedule(leftScheduledAt);
  const right = formatReminderLocalSchedule(rightScheduledAt);

  return (
    left !== null &&
    right !== null &&
    left.date === right.date &&
    left.time === right.time
  );
};

export const createDefaultReminderLocalSchedule = (
  nowTimestamp = Date.now(),
): ReminderLocalSchedule => {
  if (!Number.isFinite(nowTimestamp)) {
    throw new TypeError('Reminder draft clock must be valid.');
  }

  const scheduledDate = new Date(
    nowTimestamp + DEFAULT_REMINDER_LEAD_TIME_MS,
  );
  const hasPartialMinute =
    scheduledDate.getSeconds() !== 0 ||
    scheduledDate.getMilliseconds() !== 0;
  scheduledDate.setSeconds(0, 0);
  const minuteRemainder =
    scheduledDate.getMinutes() % REMINDER_TIME_STEP_MINUTES;
  const minuteAdjustment =
    minuteRemainder === 0
      ? hasPartialMinute
        ? REMINDER_TIME_STEP_MINUTES
        : 0
      : REMINDER_TIME_STEP_MINUTES - minuteRemainder;

  if (minuteAdjustment > 0) {
    scheduledDate.setMinutes(
      scheduledDate.getMinutes() + minuteAdjustment,
    );
  }

  return {
    date: formatLocalDate(scheduledDate),
    time: formatLocalTime(scheduledDate),
  };
};

export const parseReminderLocalSchedule = (
  dateValue: string,
  timeValue: string,
): string | null => {
  const dateMatch = DATE_INPUT_PATTERN.exec(dateValue);
  const timeMatch = TIME_INPUT_PATTERN.exec(timeValue);

  if (dateMatch === null || timeMatch === null) {
    return null;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const scheduledDate = new Date(0);
  scheduledDate.setFullYear(year, month - 1, day);
  scheduledDate.setHours(hour, minute, 0, 0);

  if (
    scheduledDate.getFullYear() !== year ||
    scheduledDate.getMonth() !== month - 1 ||
    scheduledDate.getDate() !== day ||
    scheduledDate.getHours() !== hour ||
    scheduledDate.getMinutes() !== minute
  ) {
    return null;
  }

  return scheduledDate.toISOString();
};
