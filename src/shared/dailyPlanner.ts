export interface DailyPlannerReminder {
  readonly id: string;
  readonly title: string;
  readonly scheduledAt: string;
}

export interface DailyPlannerBriefing {
  readonly greeting: string;
  readonly reminders: readonly DailyPlannerReminder[];
}
