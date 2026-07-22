import {
  AIProviderError,
  type AIModel,
  type AIProviderId,
} from '../AIProvider';

const readNumericStatus = (error: unknown): number | null => {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return null;
  }

  const status = error.status;
  return typeof status === 'number' ? status : null;
};

const isConnectionFailure = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const details = `${error.name} ${error.message}`.toLowerCase();

  return [
    'abort',
    'connection',
    'econnrefused',
    'enotfound',
    'fetch failed',
    'network',
    'socket',
    'timeout',
  ].some((marker) => details.includes(marker));
};

export const toProviderError = (
  providerId: AIProviderId,
  displayName: string,
  error: unknown,
): AIProviderError => {
  if (error instanceof AIProviderError) {
    return error;
  }

  const status = readNumericStatus(error);
  let message: string;

  switch (status) {
    case 400:
      message = `${displayName} rejected the configured request.`;
      break;
    case 401:
      message = `${displayName} did not accept the configured API key.`;
      break;
    case 403:
      message = `${displayName} denied access for this API key.`;
      break;
    case 404:
      message = `${displayName} could not find the configured model or endpoint.`;
      break;
    case 408:
      message = `${displayName} timed out.`;
      break;
    case 429:
      message = `${displayName} is rate limited. Try again shortly.`;
      break;
    default:
      if (status !== null && status >= 500) {
        message = `${displayName} is temporarily unavailable.`;
      } else if (isConnectionFailure(error)) {
        message = `Could not connect to ${displayName}.`;
      } else {
        message = `${displayName} request failed.`;
      }
  }

  return new AIProviderError(providerId, 'connection', message, {
    cause: error,
  });
};

export const createEmptyResponseError = (
  providerId: AIProviderId,
  displayName: string,
): AIProviderError =>
  new AIProviderError(
    providerId,
    'empty_response',
    `${displayName} returned an empty response.`,
  );

export const createConfigurationError = (
  providerId: AIProviderId,
  message: string,
): AIProviderError =>
  new AIProviderError(providerId, 'configuration', message);

export const createStreamingUnsupportedError = (
  providerId: AIProviderId,
  displayName: string,
): AIProviderError =>
  new AIProviderError(
    providerId,
    'unsupported_operation',
    `${displayName} streaming is not enabled in this application.`,
  );

export const normalizeModels = (
  models: readonly AIModel[],
): readonly AIModel[] => {
  const modelsById = new Map<string, AIModel>();

  for (const model of models) {
    const id = model.id.trim();

    if (id.length === 0 || modelsById.has(id)) {
      continue;
    }

    const displayName = model.displayName?.trim();
    modelsById.set(id, {
      id,
      ...(displayName === undefined || displayName.length === 0
        ? {}
        : { displayName }),
    });

  }

  return [...modelsById.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
};
