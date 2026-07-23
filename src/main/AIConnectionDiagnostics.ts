import { AIProviderError } from '../ai/AIProvider';
import type { AIConnectionTestResult } from '../shared/types';

export interface AIConnectionDiagnosticsLogger {
  (
    event: string,
    details: Readonly<Record<string, unknown>>,
  ): void;
}

const defaultLogger: AIConnectionDiagnosticsLogger = (event, details) => {
  console.error(event, details);
};

export const getGrokConnectionTestFailure = (
  error: unknown,
  log: AIConnectionDiagnosticsLogger = defaultLogger,
): AIConnectionTestResult | null => {
  if (!(error instanceof AIProviderError) || error.providerId !== 'grok') {
    return null;
  }

  const diagnostics = error.httpDiagnostics;

  if (diagnostics !== undefined) {
    log('[ai] grok_connection_test_failed', {
      requestUrl: diagnostics.requestUrl,
      httpStatusCode: diagnostics.httpStatusCode,
      responseBody: diagnostics.responseBody,
      errorCode: diagnostics.errorCode,
      errorMessage: diagnostics.errorMessage,
    });
  } else {
    log('[ai] grok_connection_test_failed', {
      errorCode: error.code,
      errorMessage: error.message,
    });
  }

  return {
    ok: false,
    message: error.message,
    ...(diagnostics === undefined ? {} : { diagnostics }),
  };
};
