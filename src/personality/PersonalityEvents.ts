import type { PersonalityMessageCategory } from './messages';

export const PERSONALITY_EVENT_TYPE = 'personality-speech' as const;

export const PERSONALITY_TRIGGERS = {
  applicationStartup: 'application-startup',
  pomodoroCompleted: 'pomodoro-completed',
  reminderCompleted: 'reminder-completed',
  waterReminderAcknowledged: 'water-reminder-acknowledged',
  stickyMessageSaved: 'sticky-message-saved',
} as const;

export type PersonalityTrigger =
  (typeof PERSONALITY_TRIGGERS)[keyof typeof PERSONALITY_TRIGGERS];

export const PERSONALITY_TRIGGER_MESSAGE_CATEGORIES = {
  [PERSONALITY_TRIGGERS.applicationStartup]: 'welcome',
  [PERSONALITY_TRIGGERS.pomodoroCompleted]: 'pomodoroComplete',
  [PERSONALITY_TRIGGERS.reminderCompleted]: 'reminderComplete',
  [PERSONALITY_TRIGGERS.waterReminderAcknowledged]: 'hydration',
  [PERSONALITY_TRIGGERS.stickyMessageSaved]: 'stickyMessageSaved',
} as const satisfies Readonly<
  Record<PersonalityTrigger, PersonalityMessageCategory>
>;

export interface PersonalitySpeechEvent {
  readonly id: number;
  readonly type: typeof PERSONALITY_EVENT_TYPE;
  readonly trigger: PersonalityTrigger;
  readonly sourceEventId: string;
  readonly message: string;
}

export type PersonalityEventListener = (
  event: PersonalitySpeechEvent,
) => void;
