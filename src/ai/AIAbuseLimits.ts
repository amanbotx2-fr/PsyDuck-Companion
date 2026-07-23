import type {
  AIConnectionResult,
  AIModel,
  AIResponse,
} from './AIProvider';

export const MAXIMUM_AI_OUTPUT_TOKENS = 4_096;
export const MAXIMUM_AI_RESPONSE_CHARACTERS = 32_768;
export const MAXIMUM_PROVIDER_ERROR_MESSAGE_CHARACTERS = 512;
export const MAXIMUM_AI_MODEL_COUNT = 256;
export const MAXIMUM_AI_MODEL_CANDIDATES = 1_024;
export const MAXIMUM_AI_MODEL_ID_CHARACTERS = 256;
export const MAXIMUM_AI_MODEL_DISPLAY_NAME_CHARACTERS = 256;

interface BoundedText {
  readonly value: string;
  readonly truncated: boolean;
}

const boundText = (value: string, maximumLength: number): BoundedText => {
  if (value.length <= maximumLength) {
    return { value, truncated: false };
  }

  let end = maximumLength;
  const finalCodeUnit = value.charCodeAt(end - 1);

  // Do not leave an unmatched UTF-16 high surrogate at the truncation edge.
  if (finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff) {
    end -= 1;
  }

  return {
    value: value.slice(0, end),
    truncated: true,
  };
};

export const limitProviderErrorMessage = (message: string): string =>
  boundText(
    message,
    MAXIMUM_PROVIDER_ERROR_MESSAGE_CHARACTERS,
  ).value;

export const limitAIResponse = (response: AIResponse): AIResponse => {
  const content = boundText(
    response.content,
    MAXIMUM_AI_RESPONSE_CHARACTERS,
  );

  return {
    ...response,
    content: content.value,
    finishReason: content.truncated ? 'length' : response.finishReason,
  };
};

export const limitAIConnectionResult = (
  result: AIConnectionResult,
): AIConnectionResult => ({
  message: limitProviderErrorMessage(result.message),
});

export const normalizeAIModels = (
  models: Iterable<AIModel>,
): readonly AIModel[] => {
  const modelsById = new Map<string, AIModel>();
  let inspectedCandidates = 0;

  for (const model of models) {
    inspectedCandidates += 1;

    if (inspectedCandidates > MAXIMUM_AI_MODEL_CANDIDATES) {
      break;
    }

    if (
      typeof model.id !== 'string' ||
      model.id.length > MAXIMUM_AI_MODEL_ID_CHARACTERS
    ) {
      continue;
    }

    const id = model.id.trim();

    if (
      id.length === 0 ||
      modelsById.has(id)
    ) {
      continue;
    }

    const rawDisplayName =
      typeof model.displayName === 'string'
        ? model.displayName
        : undefined;
    const displayName =
      rawDisplayName === undefined ||
      rawDisplayName.length > MAXIMUM_AI_MODEL_DISPLAY_NAME_CHARACTERS
        ? undefined
        : rawDisplayName.trim();
    modelsById.set(id, {
      id,
      ...(displayName === undefined ||
      displayName.length === 0
        ? {}
        : { displayName }),
    });

    if (modelsById.size >= MAXIMUM_AI_MODEL_COUNT) {
      break;
    }
  }

  return [...modelsById.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
};
