export const AI_CONTEXT_ROLES = [
  'system',
  'user',
  'assistant',
] as const;

export type AIContextRole = (typeof AI_CONTEXT_ROLES)[number];

export type AIContextMetadataValue = string | number | boolean | null;

export interface AIContextMessage {
  readonly role: AIContextRole;
  readonly content: string;
}

export interface AIContext {
  readonly messages: readonly AIContextMessage[];
  readonly metadata?: Readonly<Record<string, AIContextMetadataValue>>;
}

export const createAIContext = (
  messages: readonly AIContextMessage[] = [],
  metadata?: Readonly<Record<string, AIContextMetadataValue>>,
): AIContext => ({
  messages: messages.map((message) => ({ ...message })),
  ...(metadata === undefined ? {} : { metadata: { ...metadata } }),
});
