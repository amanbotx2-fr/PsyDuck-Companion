import {
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type RequestOptions,
} from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

import {
  addressesMatch,
  type OllamaEndpointPolicy,
  type ParsedOllamaEndpoint,
  type ResolvedOllamaAddress,
} from './OllamaEndpointPolicy';

const KIBIBYTE = 1_024;
const MEBIBYTE = 1_024 * KIBIBYTE;
type FetchInput = Parameters<typeof fetch>[0];
type FetchOptions = Parameters<typeof fetch>[1];
type FetchBody = NonNullable<FetchOptions>['body'];
type FetchHeaders = NonNullable<FetchOptions>['headers'];

export type OllamaTransportErrorCode =
  | 'cancelled'
  | 'invalid_request'
  | 'network'
  | 'redirect_rejected'
  | 'response_too_large'
  | 'timeout'
  | 'unexpected_address'
  | 'unsupported_encoding';

export class OllamaTransportError extends Error {
  public constructor(
    public readonly code: OllamaTransportErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'OllamaTransportError';
  }
}

export interface OllamaOperationLimits {
  readonly maximumRequestBytes: number;
  readonly maximumResponseBytes: number;
  readonly timeoutMs: number;
}

export interface OllamaTransportLimits {
  readonly chat: OllamaOperationLimits;
  readonly models: OllamaOperationLimits;
}

export const DEFAULT_OLLAMA_TRANSPORT_LIMITS: OllamaTransportLimits = {
  chat: {
    maximumRequestBytes: 64 * KIBIBYTE,
    maximumResponseBytes: 4 * MEBIBYTE,
    timeoutMs: 120_000,
  },
  models: {
    maximumRequestBytes: 0,
    maximumResponseBytes: 1 * MEBIBYTE,
    timeoutMs: 15_000,
  },
};

type OllamaOperation = keyof OllamaTransportLimits;

interface OllamaRequestDescriptor {
  readonly method: 'GET' | 'POST';
  readonly operation: OllamaOperation;
}

const REQUEST_DESCRIPTORS: Readonly<
  Record<string, OllamaRequestDescriptor>
> = {
  '/api/chat': {
    method: 'POST',
    operation: 'chat',
  },
  '/api/tags': {
    method: 'GET',
    operation: 'models',
  },
};

const createCancellationError = (): OllamaTransportError =>
  new OllamaTransportError(
    'cancelled',
    'The Ollama request was cancelled.',
  );

const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw signal.reason instanceof OllamaTransportError
      ? signal.reason
      : createCancellationError();
  }
};

const toRequestUrl = (input: FetchInput): URL => {
  if (typeof input === 'string' || input instanceof URL) {
    return new URL(input);
  }

  throw new OllamaTransportError(
    'invalid_request',
    'The Ollama request target is invalid.',
  );
};

const toRequestBody = (body: FetchBody): Buffer => {
  if (body === undefined || body === null) {
    return Buffer.alloc(0);
  }

  if (typeof body === 'string') {
    return Buffer.from(body, 'utf8');
  }

  if (body instanceof URLSearchParams) {
    return Buffer.from(body.toString(), 'utf8');
  }

  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }

  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }

  throw new OllamaTransportError(
    'invalid_request',
    'The Ollama request body type is not allowed.',
  );
};

const getContentLength = (
  headers: IncomingHttpHeaders,
): number | null => {
  const value = headers['content-length'];
  const normalizedValue = Array.isArray(value) ? value[0] : value;

  if (
    normalizedValue === undefined ||
    !/^[0-9]+$/.test(normalizedValue)
  ) {
    return null;
  }

  const contentLength = Number(normalizedValue);
  return Number.isSafeInteger(contentLength) ? contentLength : null;
};

const getResponseHeaders = (
  headers: IncomingHttpHeaders,
): Record<string, string> => {
  const responseHeaders: Record<string, string> = {};
  const contentType = headers['content-type'];

  if (typeof contentType === 'string') {
    responseHeaders['content-type'] = contentType;
  }

  return responseHeaders;
};

export class OllamaTransport {
  private readonly activeControllers = new Set<AbortController>();

  public readonly fetch: typeof fetch = this.createFetch();

  public constructor(
    private readonly endpoint: ParsedOllamaEndpoint,
    private readonly endpointPolicy: OllamaEndpointPolicy,
    private readonly limits: OllamaTransportLimits =
      DEFAULT_OLLAMA_TRANSPORT_LIMITS,
  ) {}

  public abortAll(): void {
    for (const controller of this.activeControllers) {
      controller.abort(createCancellationError());
    }

    this.activeControllers.clear();
  }

  public createFetch(externalSignal?: AbortSignal): typeof fetch {
    return async (input, init) => {
      const sdkSignal = init?.signal ?? undefined;
      const signal =
        externalSignal === undefined
          ? sdkSignal
          : sdkSignal === undefined || sdkSignal === externalSignal
            ? externalSignal
            : AbortSignal.any([externalSignal, sdkSignal]);

      return this.execute(input, {
        ...init,
        ...(signal === undefined ? {} : { signal }),
      });
    };
  }

  private async execute(
    input: FetchInput,
    init: FetchOptions,
  ): Promise<Response> {
    const requestUrl = toRequestUrl(input);
    const descriptor = REQUEST_DESCRIPTORS[requestUrl.pathname];
    const method = (init?.method ?? 'GET').toUpperCase();

    if (
      descriptor === undefined ||
      requestUrl.origin !== this.endpoint.origin ||
      requestUrl.username.length > 0 ||
      requestUrl.password.length > 0 ||
      requestUrl.search.length > 0 ||
      requestUrl.hash.length > 0 ||
      method !== descriptor.method
    ) {
      throw new OllamaTransportError(
        'invalid_request',
        'The Ollama request is not allowed.',
      );
    }

    const operationLimits = this.limits[descriptor.operation];
    const body = toRequestBody(init?.body);

    if (body.byteLength > operationLimits.maximumRequestBytes) {
      throw new OllamaTransportError(
        'invalid_request',
        'The Ollama request exceeds the safe size limit.',
      );
    }

    const controller = new AbortController();
    const externalSignal = init?.signal;
    const handleExternalAbort = (): void => {
      controller.abort(createCancellationError());
    };
    const timeout = setTimeout(() => {
      controller.abort(
        new OllamaTransportError(
          'timeout',
          'The Ollama request timed out.',
        ),
      );
    }, operationLimits.timeoutMs);

    this.activeControllers.add(controller);

    if (externalSignal?.aborted === true) {
      handleExternalAbort();
    } else {
      externalSignal?.addEventListener('abort', handleExternalAbort, {
        once: true,
      });
    }

    try {
      const addresses = await this.endpointPolicy.resolve(
        this.endpoint,
        controller.signal,
      );
      let lastNetworkError: unknown = null;

      for (const address of addresses) {
        throwIfAborted(controller.signal);

        try {
          return await this.requestAddress(
            requestUrl,
            method,
            body,
            init?.headers,
            address,
            operationLimits.maximumResponseBytes,
            controller.signal,
          );
        } catch (error) {
          if (error instanceof OllamaTransportError) {
            throw error;
          }

          lastNetworkError = error;
        }
      }

      throw new OllamaTransportError(
        'network',
        'Could not connect to the local Ollama server.',
        { cause: lastNetworkError },
      );
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener(
        'abort',
        handleExternalAbort,
      );
      this.activeControllers.delete(controller);
    }
  }

  private requestAddress(
    requestUrl: URL,
    method: string,
    body: Buffer,
    sourceHeaders: FetchHeaders,
    address: ResolvedOllamaAddress,
    maximumResponseBytes: number,
    signal: AbortSignal,
  ): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      const incomingHeaders = new Headers(sourceHeaders);
      const headers: OutgoingHttpHeaders = {
        accept: incomingHeaders.get('accept') ?? 'application/json',
        'accept-encoding': 'identity',
        'content-type':
          incomingHeaders.get('content-type') ?? 'application/json',
        host: this.endpoint.authority,
        'user-agent':
          incomingHeaders.get('user-agent') ?? 'PsyDuck/Ollama',
        ...(body.byteLength === 0
          ? {}
          : { 'content-length': body.byteLength }),
      };
      const requestOptions: RequestOptions = {
        agent: false,
        family: address.family,
        headers,
        hostname: address.address,
        method,
        path: requestUrl.pathname,
        port: this.endpoint.port,
        protocol: this.endpoint.protocol,
      };
      let settled = false;

      const settleWithError = (
        error: unknown,
        response?: IncomingMessage,
      ): void => {
        if (settled) {
          return;
        }

        settled = true;
        signal.removeEventListener('abort', handleAbort);
        response?.destroy();
        reject(error);
      };

      const settleWithResponse = (response: Response): void => {
        if (settled) {
          return;
        }

        settled = true;
        signal.removeEventListener('abort', handleAbort);
        resolve(response);
      };

      const handleResponse = (response: IncomingMessage): void => {
        const connectedAddress = response.socket.remoteAddress;

        if (
          connectedAddress === undefined ||
          !addressesMatch(address.address, connectedAddress)
        ) {
          settleWithError(
            new OllamaTransportError(
              'unexpected_address',
              'The Ollama connection reached an unexpected address.',
            ),
            response,
          );
          return;
        }

        const statusCode = response.statusCode ?? 0;

        if (statusCode >= 300 && statusCode < 400) {
          settleWithError(
            new OllamaTransportError(
              'redirect_rejected',
              'Ollama redirects are not allowed.',
            ),
            response,
          );
          return;
        }

        const contentEncoding = response.headers['content-encoding'];

        if (
          contentEncoding !== undefined &&
          contentEncoding.toLowerCase() !== 'identity'
        ) {
          settleWithError(
            new OllamaTransportError(
              'unsupported_encoding',
              'The Ollama response encoding is not allowed.',
            ),
            response,
          );
          return;
        }

        const declaredContentLength = getContentLength(response.headers);

        if (
          declaredContentLength !== null &&
          declaredContentLength > maximumResponseBytes
        ) {
          settleWithError(
            new OllamaTransportError(
              'response_too_large',
              'The Ollama response exceeds the safe size limit.',
            ),
            response,
          );
          return;
        }

        const chunks: Buffer[] = [];
        let receivedBytes = 0;

        response.on('data', (chunk: Buffer | string) => {
          if (settled) {
            return;
          }

          const buffer = Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk);
          receivedBytes += buffer.byteLength;

          if (receivedBytes > maximumResponseBytes) {
            settleWithError(
              new OllamaTransportError(
                'response_too_large',
                'The Ollama response exceeds the safe size limit.',
              ),
              response,
            );
            return;
          }

          chunks.push(buffer);
        });
        response.once('aborted', () => {
          settleWithError(
            new OllamaTransportError(
              'network',
              'The Ollama response ended unexpectedly.',
            ),
            response,
          );
        });
        response.once('error', (error) => {
          settleWithError(error, response);
        });
        response.once('end', () => {
          if (settled) {
            return;
          }

          if (statusCode < 200 || statusCode > 599) {
            settleWithError(
              new OllamaTransportError(
                'network',
                'Ollama returned an invalid HTTP status.',
              ),
              response,
            );
            return;
          }

          const responseBody = Buffer.concat(chunks, receivedBytes);
          const bodyValue =
            statusCode === 204 || statusCode === 205
              ? null
              : responseBody;

          settleWithResponse(
            new Response(bodyValue, {
              headers: getResponseHeaders(response.headers),
              status: statusCode,
            }),
          );
        });
      };

      const clientRequest =
        this.endpoint.protocol === 'https:'
          ? httpsRequest(
              {
                ...requestOptions,
                rejectUnauthorized: true,
                ...(isIP(this.endpoint.hostname) === 0
                  ? { servername: this.endpoint.hostname }
                  : {}),
              },
              handleResponse,
            )
          : httpRequest(requestOptions, handleResponse);

      const handleAbort = (): void => {
        const error =
          signal.reason instanceof OllamaTransportError
            ? signal.reason
            : createCancellationError();
        clientRequest.destroy();
        settleWithError(error);
      };

      signal.addEventListener('abort', handleAbort, { once: true });
      clientRequest.once('error', (error) => {
        if (signal.aborted) {
          handleAbort();
          return;
        }

        settleWithError(error);
      });

      if (signal.aborted) {
        handleAbort();
        return;
      }

      clientRequest.end(body.byteLength === 0 ? undefined : body);
    });
  }
}
