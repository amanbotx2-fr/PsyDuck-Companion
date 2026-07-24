export const AI_CONVERSATION_MESSAGE_ROLES = [
  'user',
  'assistant',
] as const;

export type AIConversationMessageRole =
  (typeof AI_CONVERSATION_MESSAGE_ROLES)[number];

export const MAX_AI_CONVERSATION_PROMPT_CHARACTERS = 4_096;
export const MAX_AI_CONVERSATION_CONTEXT_MESSAGES = 16;
export const MAX_AI_CONVERSATION_CONTEXT_CHARACTERS = 24_000;
export const MAX_AI_CONVERSATION_CONTEXT_MESSAGE_CHARACTERS = 12_000;

const CONTEXT_OMISSION_MARKER = '\n[Earlier content omitted]\n';

export interface AIConversationMessage {
  readonly id: number;
  readonly role: AIConversationMessageRole;
  readonly content: string;
  readonly includeInContext: boolean;
}

export interface AIConversationContextMessage {
  readonly role: AIConversationMessageRole;
  readonly content: string;
}

export interface AIConversationRequest {
  readonly prompt: string;
  readonly history: readonly AIConversationContextMessage[];
}

interface AIConversationSession {
  readonly id: number;
  readonly pinned: boolean;
  readonly messages: readonly AIConversationMessage[];
  readonly nextMessageId: number;
}

export type AIConversationState =
  | { readonly phase: 'idle' }
  | {
      readonly phase: 'input-open';
      readonly session: AIConversationSession;
    }
  | {
      readonly phase: 'generating';
      readonly session: AIConversationSession;
      readonly requestId: number;
      readonly startedAt: number;
    }
  | {
      readonly phase: 'showing-response';
      readonly session: AIConversationSession;
      readonly requestId: number;
    };

export type AIConversationAction =
  | {
      readonly type: 'start';
      readonly conversationId: number;
    }
  | {
      readonly type: 'submit';
      readonly prompt: string;
      readonly requestId: number;
      readonly startedAt: number;
    }
  | {
      readonly type: 'receive-response';
      readonly requestId: number;
      readonly content: string;
      readonly includeInContext: boolean;
    }
  | { readonly type: 'continue' }
  | {
      readonly type: 'set-pinned';
      readonly pinned: boolean;
    }
  | { readonly type: 'close' };

export const INITIAL_AI_CONVERSATION_STATE: AIConversationState = {
  phase: 'idle',
};

const appendMessage = (
  session: AIConversationSession,
  role: AIConversationMessageRole,
  content: string,
  includeInContext: boolean,
): AIConversationSession => ({
  ...session,
  messages: [
    ...session.messages,
    {
      id: session.nextMessageId,
      role,
      content,
      includeInContext,
    },
  ],
  nextMessageId: session.nextMessageId + 1,
});

const updatePinnedState = (
  state: Exclude<AIConversationState, { readonly phase: 'idle' }>,
  pinned: boolean,
): AIConversationState => ({
  ...state,
  session: {
    ...state.session,
    pinned,
  },
});

export const reduceAIConversation = (
  state: AIConversationState,
  action: AIConversationAction,
): AIConversationState => {
  switch (action.type) {
    case 'start': {
      if (
        state.phase !== 'idle' ||
        !Number.isSafeInteger(action.conversationId) ||
        action.conversationId <= 0
      ) {
        return state;
      }

      return {
        phase: 'input-open',
        session: {
          id: action.conversationId,
          pinned: false,
          messages: [],
          nextMessageId: 1,
        },
      };
    }

    case 'submit': {
      const prompt = action.prompt.trim();

      if (
        state.phase !== 'input-open' ||
        prompt.length === 0 ||
        !Number.isSafeInteger(action.requestId) ||
        action.requestId <= 0 ||
        !Number.isFinite(action.startedAt)
      ) {
        return state;
      }

      return {
        phase: 'generating',
        session: appendMessage(state.session, 'user', prompt, true),
        requestId: action.requestId,
        startedAt: action.startedAt,
      };
    }

    case 'receive-response': {
      const content = action.content.trim();

      if (
        state.phase !== 'generating' ||
        state.requestId !== action.requestId ||
        content.length === 0
      ) {
        return state;
      }

      return {
        phase: 'showing-response',
        session: appendMessage(
          state.session,
          'assistant',
          content,
          action.includeInContext,
        ),
        requestId: action.requestId,
      };
    }

    case 'continue':
      return state.phase === 'showing-response'
        ? {
            phase: 'input-open',
            session: state.session,
          }
        : state;

    case 'set-pinned':
      return state.phase === 'idle'
        ? state
        : updatePinnedState(state, action.pinned);

    case 'close':
      return state.phase === 'idle'
        ? state
        : INITIAL_AI_CONVERSATION_STATE;
  }
};

const truncateContextContent = (
  content: string,
  maximumLength: number,
): string => {
  if (content.length <= maximumLength) {
    return content;
  }

  if (maximumLength <= CONTEXT_OMISSION_MARKER.length) {
    return content.slice(-maximumLength);
  }

  const availableLength =
    maximumLength - CONTEXT_OMISSION_MARKER.length;
  const leadingLength = Math.ceil(availableLength / 2);
  const trailingLength = Math.floor(availableLength / 2);

  return `${content.slice(0, leadingLength)}${CONTEXT_OMISSION_MARKER}${content.slice(-trailingLength)}`;
};

export const selectAIConversationContext = (
  state: AIConversationState,
): readonly AIConversationContextMessage[] => {
  if (state.phase === 'idle') {
    return [];
  }

  const selected: AIConversationContextMessage[] = [];
  let remainingCharacters =
    MAX_AI_CONVERSATION_CONTEXT_CHARACTERS;

  for (
    let index = state.session.messages.length - 1;
    index >= 0 &&
    selected.length < MAX_AI_CONVERSATION_CONTEXT_MESSAGES &&
    remainingCharacters > 0;
    index -= 1
  ) {
    const message = state.session.messages[index];

    if (message === undefined || !message.includeInContext) {
      continue;
    }

    const maximumMessageLength = Math.min(
      MAX_AI_CONVERSATION_CONTEXT_MESSAGE_CHARACTERS,
      remainingCharacters,
    );
    const content = truncateContextContent(
      message.content,
      maximumMessageLength,
    );

    if (content.length === 0) {
      continue;
    }

    selected.unshift({
      role: message.role,
      content,
    });
    remainingCharacters -= content.length;
  }

  return selected;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parsePrompt = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    value.length > MAX_AI_CONVERSATION_PROMPT_CHARACTERS
  ) {
    throw new TypeError(
      `AI prompt must be a string no longer than ${MAX_AI_CONVERSATION_PROMPT_CHARACTERS} characters.`,
    );
  }

  const prompt = value.trim();

  if (prompt.length === 0) {
    throw new TypeError('AI prompt must not be empty.');
  }

  return prompt;
};

export const parseAIConversationRequest = (
  value: unknown,
): AIConversationRequest => {
  if (typeof value === 'string') {
    return {
      prompt: parsePrompt(value),
      history: [],
    };
  }

  if (!isRecord(value) || !Array.isArray(value.history)) {
    throw new TypeError('AI conversation request is invalid.');
  }

  if (value.history.length > MAX_AI_CONVERSATION_CONTEXT_MESSAGES) {
    throw new RangeError('AI conversation history has too many messages.');
  }

  const history: AIConversationContextMessage[] = [];
  let totalCharacters = 0;

  for (const entry of value.history) {
    if (
      !isRecord(entry) ||
      !AI_CONVERSATION_MESSAGE_ROLES.includes(
        entry.role as AIConversationMessageRole,
      ) ||
      typeof entry.content !== 'string' ||
      entry.content.length >
        MAX_AI_CONVERSATION_CONTEXT_MESSAGE_CHARACTERS
    ) {
      throw new TypeError('AI conversation history is invalid.');
    }

    const content = entry.content.trim();

    if (content.length === 0) {
      throw new TypeError(
        'AI conversation history messages must not be empty.',
      );
    }

    totalCharacters += content.length;

    if (totalCharacters > MAX_AI_CONVERSATION_CONTEXT_CHARACTERS) {
      throw new RangeError('AI conversation history is too large.');
    }

    history.push({
      role: entry.role as AIConversationMessageRole,
      content,
    });
  }

  return {
    prompt: parsePrompt(value.prompt),
    history,
  };
};
