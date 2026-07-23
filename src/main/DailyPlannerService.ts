import type {
  DailyPlannerBriefing,
  DailyPlannerReminder,
} from '../shared/dailyPlanner';
import {
  getReminderSchedule,
  type Reminder,
} from '../shared/reminders';
import {
  DEFAULT_USER_NAME,
  normalizeUserName,
} from '../shared/settings';
import type { ReminderService } from './ReminderService';

export interface DailyPlannerServiceDependencies {
  readonly now?: () => Date;
}

type ReminderSource = Pick<ReminderService, 'listReminders'>;

const MORNING_END_HOUR = 12;
const AFTERNOON_END_HOUR = 18;

const isSameLocalDate = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const comparePlannerReminders = (
  left: DailyPlannerReminder,
  right: DailyPlannerReminder,
): number =>
  Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt) ||
  left.id.localeCompare(right.id);

const toPlannerReminder = (
  reminder: Reminder,
  now: Date,
): DailyPlannerReminder | null => {
  if (reminder.completed) {
    return null;
  }

  const scheduledAt = getReminderSchedule(reminder);
  const scheduledTimestamp = Date.parse(scheduledAt);

  if (
    !Number.isFinite(scheduledTimestamp) ||
    scheduledTimestamp < now.getTime()
  ) {
    return null;
  }

  const scheduledDate = new Date(scheduledTimestamp);

  if (!isSameLocalDate(scheduledDate, now)) {
    return null;
  }

  return {
    id: reminder.id,
    title: reminder.title,
    scheduledAt,
  };
};

export const getDailyPlannerGreeting = (
  userName: unknown,
  date = new Date(),
): string => {
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError('Daily planner clock must be valid.');
  }

  const normalizedUserName =
    normalizeUserName(userName) ?? DEFAULT_USER_NAME;
  const hour = date.getHours();
  const period =
    hour < MORNING_END_HOUR
      ? 'Morning'
      : hour < AFTERNOON_END_HOUR
        ? 'Afternoon'
        : 'Evening';

  return `Good ${period}, ${normalizedUserName}.`;
};

export class DailyPlannerService {
  private readonly now: () => Date;
  private readonly reminderSource: ReminderSource;

  public constructor(
    reminderSource: ReminderSource,
    dependencies: DailyPlannerServiceDependencies = {},
  ) {
    this.reminderSource = reminderSource;
    this.now = dependencies.now ?? (() => new Date());
  }

  public getBriefing(userName: unknown): DailyPlannerBriefing {
    const now = this.now();

    if (!Number.isFinite(now.getTime())) {
      throw new TypeError('Daily planner clock must be valid.');
    }

    const reminders = this.reminderSource
      .listReminders()
      .map((reminder) => toPlannerReminder(reminder, now))
      .filter(
        (reminder): reminder is DailyPlannerReminder =>
          reminder !== null,
      )
      .sort(comparePlannerReminders);

    return {
      greeting: getDailyPlannerGreeting(userName, now),
      reminders,
    };
  }
}
