import {
  cloneReminder,
  type Reminder,
} from '../shared/reminders';

export const REMINDER_EVENT_TYPES = {
  fired: 'reminder-fired',
} as const;

export interface ReminderFiredEvent {
  readonly type: typeof REMINDER_EVENT_TYPES.fired;
  readonly reminder: Reminder;
  readonly firedAt: string;
  readonly overdue: boolean;
}

export type ReminderEvent = ReminderFiredEvent;
export type ReminderEventListener = (event: ReminderEvent) => void;

const cloneEvent = (event: ReminderEvent): ReminderEvent => ({
  ...event,
  reminder: cloneReminder(event.reminder),
});

export class ReminderEventBus {
  private readonly listeners = new Set<ReminderEventListener>();

  public subscribe(listener: ReminderEventListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(event: ReminderEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(cloneEvent(event));
      } catch (error) {
        console.error('[reminder-events] listener_failed', error);
      }
    }
  }
}
