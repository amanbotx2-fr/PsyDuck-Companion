import type { CreateReminderInput } from '../../shared/reminders';

export const ASSISTANT_ACTION_TYPES = [
  'createReminder',
  'setStickyMessage',
] as const;

export type AssistantActionType =
  (typeof ASSISTANT_ACTION_TYPES)[number];

export interface CreateReminderAssistantAction {
  readonly type: 'createReminder';
  readonly payload: CreateReminderInput;
}

export interface SetStickyMessageAssistantAction {
  readonly type: 'setStickyMessage';
  readonly payload: {
    readonly message: string;
  };
}

export type AssistantAction =
  | CreateReminderAssistantAction
  | SetStickyMessageAssistantAction;

export interface AssistantActionExecutionResult {
  readonly actionType: AssistantActionType;
  readonly confirmation: string;
}
