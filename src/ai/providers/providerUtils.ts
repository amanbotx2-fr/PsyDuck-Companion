import { STATUS_CODES } from 'node:http';

import {
  AIProviderError,
  type AIModel,
  type AIProviderHttpDiagnostics,
  type AIProviderId,
} from '../AIProvider';
import {
  limitProviderErrorMessage,
  normalizeAIModels,
} from '../AIAbuseLimits';

const MAXIMUM_HTTP_DIAGNOSTIC_BODY_CHARACTERS = 2_048;
const MAXIMUM_HTTP_DIAGNOSTIC_FIELD_CHARACTERS = 512;
const REDACTED_VALUE = '[redacted]';
const NO_RESPONSE_BODY = '(no response body)';

const truncateDiagnosticText = (
  value: string,
  maximumLength: number,
): string => {
  if (value.length <= maximumLength) {
    return value;
  }

  let end = maximumLength - 1;
  const finalCodeUnit = value.charCodeAt(end - 1);

  if (finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff) {
    end -= 1;
  }

  return `${value.slice(0, end)}…`;
};

const redactDiagnosticSecrets = (value: string): string =>
  value
    .replace(
      /("(?:api[_-]?key|authorization|access[_-]?token|token)"\s*:\s*)"[^"]*"/gi,
      `$1"${REDACTED_VALUE}"`,
    )
    .replace(
      /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
      `Bearer ${REDACTED_VALUE}`,
    )
    .replace(/\b(?:xai|sk)-[A-Za-z0-9_-]{8,}\b/g, REDACTED_VALUE);

const boundDiagnosticText = (
  value: string,
  maximumLength = MAXIMUM_HTTP_DIAGNOSTIC_FIELD_CHARACTERS,
): string =>
  truncateDiagnosticText(
    redactDiagnosticSecrets(value),
    maximumLength,
  );

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const readString = (
  value: Record<string, unknown> | null,
  key: string,
): string | null => {
  const candidate = value?.[key];
  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
};

const serializeResponseBody = (
  source: Record<string, unknown> | null,
  httpStatusCode: number | null,
): string => {
  if (source === null) {
    return NO_RESPONSE_BODY;
  }

  if (source.error !== undefined) {
    try {
      return JSON.stringify({ error: source.error });
    } catch {
      return String(source.error);
    }
  }

  const errorMessage = readString(source, 'message');

  if (
    httpStatusCode === null ||
    errorMessage === null ||
    errorMessage.includes('status code (no body)')
  ) {
    return NO_RESPONSE_BODY;
  }

  return errorMessage.replace(
    new RegExp(`^${httpStatusCode}\\s+`),
    '',
  );
};

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

  const details = limitProviderErrorMessage(
    `${error.name} ${error.message}`,
  ).toLowerCase();

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

export const createProviderHttpDiagnostics = (
  requestUrl: string,
  error: unknown,
): AIProviderHttpDiagnostics => {
  const source = asRecord(error);
  const responseError = asRecord(source?.error);
  const httpStatusCode = readNumericStatus(error);
  const rawErrorMessage =
    readString(responseError, 'message') ??
    (error instanceof Error && error.message.trim().length > 0
      ? error.message.trim()
      : 'Unknown provider error.');
  const rawErrorCode =
    readString(source, 'code') ?? readString(responseError, 'code');

  return {
    requestUrl: boundDiagnosticText(requestUrl, 2_048),
    httpStatusCode,
    httpStatusText:
      httpStatusCode === null ? null : (STATUS_CODES[httpStatusCode] ?? null),
    responseBody: boundDiagnosticText(
      serializeResponseBody(source, httpStatusCode),
      MAXIMUM_HTTP_DIAGNOSTIC_BODY_CHARACTERS,
    ),
    errorCode:
      rawErrorCode === null ? null : boundDiagnosticText(rawErrorCode),
    errorMessage: boundDiagnosticText(rawErrorMessage),
  };
};

export const toProviderHttpError = (
  providerId: AIProviderId,
  displayName: string,
  requestUrl: string,
  error: unknown,
): AIProviderError => {
  if (
    error instanceof AIProviderError &&
    error.httpDiagnostics !== undefined
  ) {
    return error;
  }

  const diagnostics = createProviderHttpDiagnostics(requestUrl, error);
  const status =
    diagnostics.httpStatusCode === null
      ? ''
      : ` (${diagnostics.httpStatusCode}${
          diagnostics.httpStatusText === null
            ? ''
            : ` ${diagnostics.httpStatusText}`
        })`;

  return new AIProviderError(
    providerId,
    'connection',
    `${displayName} connection failed${status}: ${diagnostics.errorMessage}`,
    {
      cause: error,
      httpDiagnostics: diagnostics,
    },
  );
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
  models: Iterable<AIModel>,
): readonly AIModel[] => normalizeAIModels(models);
