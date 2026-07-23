import { areReminderLocalSchedulesEqual } from './reminderDraft';
import {
  getReminderSchedule,
  type CreateReminderInput,
  type Reminder,
  type UpdateReminderInput,
} from './reminders';
import {
  areReminderRecurrencesEqual,
  NO_REMINDER_RECURRENCE,
  type ReminderRecurrence,
} from './reminderRecurrence';

export const REMINDER_MANAGER_VIEWS = [
  'upcoming',
  'completed',
  'all',
] as const;

export type ReminderManagerView =
  (typeof REMINDER_MANAGER_VIEWS)[number];

export type ReminderDisplayStatus =
  | 'upcoming'
  | 'overdue'
  | 'completed';

export interface ReminderManagerGroups {
  readonly upcoming: readonly Reminder[];
  readonly completed: readonly Reminder[];
  readonly all: readonly Reminder[];
}

const compareIds = (left: Reminder, right: Reminder): number =>
  left.id.localeCompare(right.id);

const compareUpcoming = (
  left: Reminder,
  right: Reminder,
): number =>
  Date.parse(getReminderSchedule(left)) -
    Date.parse(getReminderSchedule(right)) ||
  compareIds(left, right);

const compareCompleted = (
  left: Reminder,
  right: Reminder,
): number =>
  // markCompleted records the completion timestamp in updatedAt.
  Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
  Date.parse(getReminderSchedule(right)) -
    Date.parse(getReminderSchedule(left)) ||
  compareIds(left, right);

export const groupRemindersForManager = (
  reminders: readonly Reminder[],
): ReminderManagerGroups => {
  const upcoming = reminders
    .filter((reminder) => !reminder.completed)
    .sort(compareUpcoming);
  const completed = reminders
    .filter((reminder) => reminder.completed)
    .sort(compareCompleted);

  return {
    upcoming,
    completed,
    all: [...upcoming, ...completed],
  };
};

export const getReminderDisplayStatus = (
  reminder: Reminder,
  nowTimestamp = Date.now(),
): ReminderDisplayStatus => {
  if (reminder.completed) {
    return 'completed';
  }

  return Date.parse(getReminderSchedule(reminder)) < nowTimestamp
    ? 'overdue'
    : 'upcoming';
};

export const createReminderUpdateInput = (
  reminder: Reminder,
  input: CreateReminderInput,
): UpdateReminderInput | null => {
  const patch: {
    title?: string;
    message?: string;
    scheduledAt?: string;
    recurrence?: ReminderRecurrence;
  } = {};
  const title = input.title.trim();
  const message = input.message?.trim() ?? '';

  if (title !== reminder.title) {
    patch.title = title;
  }

  if (message !== reminder.message) {
    patch.message = message;
  }

  if (
    !areReminderLocalSchedulesEqual(
      input.scheduledAt,
      getReminderSchedule(reminder),
    )
  ) {
    patch.scheduledAt = input.scheduledAt;
  }

  if (
    input.recurrence !== undefined &&
    !areReminderRecurrencesEqual(
      input.recurrence,
      reminder.recurrence ?? NO_REMINDER_RECURRENCE,
    )
  ) {
    patch.recurrence = input.recurrence;
  }

  return Object.keys(patch).length === 0 ? null : patch;
};
