import {
  parseReminderRecurrence,
  type ReminderRecurrence,
} from '../../shared/reminderRecurrence';
import type {
  AssistantAction,
  CreateReminderAssistantAction,
  SetStickyMessageAssistantAction,
} from './AssistantAction';

export type AssistantActionParseErrorCode =
  | 'invalid_action'
  | 'invalid_payload'
  | 'unknown_action';

export class AssistantActionParseError extends TypeError {
  public constructor(
    public readonly code: AssistantActionParseErrorCode,
  ) {
    super('The assistant returned an invalid action.');
    this.name = 'AssistantActionParseError';
  }
}

export type AssistantResponseInterpretation =
  | {
      readonly kind: 'message';
      readonly content: string;
    }
  | {
      readonly kind: 'action';
      readonly action: AssistantAction;
    };

const CREATE_REMINDER_PAYLOAD_KEYS = [
  'title',
  'message',
  'scheduledAt',
  'recurrence',
] as const;
const SET_STICKY_MESSAGE_PAYLOAD_KEYS = ['message'] as const;
const ACTION_KEYS = ['type', 'payload'] as const;
const JSON_CODE_FENCE_PATTERN =
  /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i;
const ACTION_CANDIDATE_PATTERN = /^\{\s*"type"\s*:/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean => Object.keys(value).every((key) => allowedKeys.includes(key));

const parseOptionalRecurrence = (
  value: unknown,
): ReminderRecurrence | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const recurrence = parseReminderRecurrence(value);

  if (recurrence === null) {
    throw new AssistantActionParseError('invalid_payload');
  }

  return recurrence;
};

const parseCreateReminderAction = (
  payload: unknown,
): CreateReminderAssistantAction => {
  // This boundary validates the action protocol only. ReminderService remains
  // authoritative for title, schedule, and persistence rules.
  if (
    !isRecord(payload) ||
    !hasOnlyKeys(payload, CREATE_REMINDER_PAYLOAD_KEYS) ||
    !Object.hasOwn(payload, 'title') ||
    !Object.hasOwn(payload, 'scheduledAt') ||
    typeof payload.title !== 'string' ||
    typeof payload.scheduledAt !== 'string' ||
    (Object.hasOwn(payload, 'message') &&
      typeof payload.message !== 'string')
  ) {
    throw new AssistantActionParseError('invalid_payload');
  }

  const recurrence = parseOptionalRecurrence(payload.recurrence);

  return {
    type: 'createReminder',
    payload: {
      title: payload.title,
      scheduledAt: payload.scheduledAt,
      ...(typeof payload.message === 'string'
        ? { message: payload.message }
        : {}),
      ...(recurrence === undefined ? {} : { recurrence }),
    },
  };
};

const parseSetStickyMessageAction = (
  payload: unknown,
): SetStickyMessageAssistantAction => {
  if (
    !isRecord(payload) ||
    !hasOnlyKeys(payload, SET_STICKY_MESSAGE_PAYLOAD_KEYS) ||
    !Object.hasOwn(payload, 'message') ||
    typeof payload.message !== 'string'
  ) {
    throw new AssistantActionParseError('invalid_payload');
  }

  return {
    type: 'setStickyMessage',
    payload: {
      message: payload.message,
    },
  };
};

const unwrapJsonCodeFence = (content: string): string => {
  const match = JSON_CODE_FENCE_PATTERN.exec(content);
  return match?.[1]?.trim() ?? content;
};

export const parseAssistantAction = (value: unknown): AssistantAction => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ACTION_KEYS) ||
    !Object.hasOwn(value, 'type') ||
    !Object.hasOwn(value, 'payload') ||
    typeof value.type !== 'string'
  ) {
    throw new AssistantActionParseError('invalid_action');
  }

  switch (value.type) {
    case 'createReminder':
      return parseCreateReminderAction(value.payload);
    case 'setStickyMessage':
      return parseSetStickyMessageAction(value.payload);
    default:
      throw new AssistantActionParseError('unknown_action');
  }
};

export const interpretAssistantResponse = (
  content: string,
): AssistantResponseInterpretation => {
  const normalizedContent = content.trim();
  const candidate = unwrapJsonCodeFence(normalizedContent);

  if (!candidate.startsWith('{')) {
    return { kind: 'message', content: normalizedContent };
  }

  let value: unknown;

  try {
    value = JSON.parse(candidate);
  } catch {
    if (ACTION_CANDIDATE_PATTERN.test(candidate)) {
      throw new AssistantActionParseError('invalid_action');
    }

    return { kind: 'message', content: normalizedContent };
  }

  if (!isRecord(value) || !Object.hasOwn(value, 'type')) {
    return { kind: 'message', content: normalizedContent };
  }

  // A response becomes executable only when it is an explicit action object.
  return {
    kind: 'action',
    action: parseAssistantAction(value),
  };
};
