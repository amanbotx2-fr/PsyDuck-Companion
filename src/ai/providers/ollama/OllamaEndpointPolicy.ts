import { lookup } from 'node:dns/promises';

const LOOPBACK_ENDPOINT_PATTERN =
  /^http:\/\/(?:localhost|127\.0\.0\.1)(?::([0-9]{1,5}))?\/?$/i;
const DEFAULT_HTTP_PORT = 80;
const MAXIMUM_RESOLVED_ADDRESSES = 16;

export type OllamaEndpointPolicyErrorCode =
  | 'cancelled'
  | 'dns_failed'
  | 'empty_resolution'
  | 'excessive_resolution'
  | 'invalid_endpoint'
  | 'non_loopback_resolution';

export class OllamaEndpointPolicyError extends Error {
  public constructor(
    public readonly code: OllamaEndpointPolicyErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'OllamaEndpointPolicyError';
  }
}

export interface ParsedOllamaEndpoint {
  readonly authority: string;
  readonly hostname: string;
  readonly origin: string;
  readonly port: number;
  readonly protocol: 'http:' | 'https:';
}

export interface ResolvedOllamaAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export type OllamaDnsResolver = (
  hostname: string,
) => Promise<readonly ResolvedOllamaAddress[]>;

export interface OllamaEndpointPolicy {
  parse(endpoint: string): ParsedOllamaEndpoint;
  resolve(
    endpoint: ParsedOllamaEndpoint,
    signal: AbortSignal,
  ): Promise<readonly ResolvedOllamaAddress[]>;
}

const defaultDnsResolver: OllamaDnsResolver = async (hostname) => {
  const addresses = await lookup(hostname, {
    all: true,
    verbatim: true,
  });

  return addresses.flatMap(({ address, family }) =>
    family === 4 || family === 6 ? [{ address, family }] : [],
  );
};

const createCancellationError = (): OllamaEndpointPolicyError =>
  new OllamaEndpointPolicyError(
    'cancelled',
    'Ollama endpoint validation was cancelled.',
  );

const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : createCancellationError();
  }
};

const resolveWithCancellation = async (
  resolver: OllamaDnsResolver,
  hostname: string,
  signal: AbortSignal,
): Promise<readonly ResolvedOllamaAddress[]> => {
  throwIfAborted(signal);

  let removeAbortListener = (): void => undefined;
  const cancellation = new Promise<never>((_resolve, reject) => {
    const handleAbort = (): void => {
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : createCancellationError(),
      );
    };

    signal.addEventListener('abort', handleAbort, { once: true });
    removeAbortListener = () => {
      signal.removeEventListener('abort', handleAbort);
    };
  });

  try {
    return await Promise.race([resolver(hostname), cancellation]);
  } finally {
    removeAbortListener();
  }
};

export const isLoopbackAddress = (address: string): boolean => {
  const normalizedAddress = address.toLowerCase();

  if (
    normalizedAddress === '::1' ||
    normalizedAddress === '0:0:0:0:0:0:0:1'
  ) {
    return true;
  }

  const octets = normalizedAddress.split('.');

  return (
    octets.length === 4 &&
    octets[0] === '127' &&
    octets.every((octet) => /^(?:0|[1-9][0-9]{0,2})$/.test(octet)) &&
    octets.every((octet) => Number(octet) <= 255)
  );
};

export const addressesMatch = (
  expectedAddress: string,
  connectedAddress: string,
): boolean => {
  const expected = expectedAddress.toLowerCase();
  const connected = connectedAddress.toLowerCase();

  return (
    expected === connected ||
    (expected.includes('.') && connected === `::ffff:${expected}`)
  );
};

export class LoopbackOllamaEndpointPolicy
  implements OllamaEndpointPolicy
{
  public constructor(
    private readonly resolveDns: OllamaDnsResolver = defaultDnsResolver,
  ) {}

  public parse(endpoint: string): ParsedOllamaEndpoint {
    if (
      endpoint.length === 0 ||
      endpoint !== endpoint.trim() ||
      !LOOPBACK_ENDPOINT_PATTERN.test(endpoint)
    ) {
      throw new OllamaEndpointPolicyError(
        'invalid_endpoint',
        'Ollama endpoints must use http://localhost or http://127.0.0.1.',
      );
    }

    let parsedEndpoint: URL;

    try {
      parsedEndpoint = new URL(endpoint);
    } catch (error) {
      throw new OllamaEndpointPolicyError(
        'invalid_endpoint',
        'The Ollama endpoint is invalid.',
        { cause: error },
      );
    }

    const port =
      parsedEndpoint.port.length === 0
        ? DEFAULT_HTTP_PORT
        : Number(parsedEndpoint.port);

    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new OllamaEndpointPolicyError(
        'invalid_endpoint',
        'The Ollama endpoint port is invalid.',
      );
    }

    const hostname = parsedEndpoint.hostname.toLowerCase();

    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      throw new OllamaEndpointPolicyError(
        'invalid_endpoint',
        'The Ollama endpoint host is not allowed.',
      );
    }

    return {
      authority: parsedEndpoint.host,
      hostname,
      origin: parsedEndpoint.origin,
      port,
      protocol: 'http:',
    };
  }

  public async resolve(
    endpoint: ParsedOllamaEndpoint,
    signal: AbortSignal,
  ): Promise<readonly ResolvedOllamaAddress[]> {
    throwIfAborted(signal);

    if (endpoint.hostname === '127.0.0.1') {
      return [{ address: '127.0.0.1', family: 4 }];
    }

    let resolvedAddresses: readonly ResolvedOllamaAddress[];

    try {
      resolvedAddresses = await resolveWithCancellation(
        this.resolveDns,
        endpoint.hostname,
        signal,
      );
    } catch (error) {
      if (
        error instanceof OllamaEndpointPolicyError &&
        error.code === 'cancelled'
      ) {
        throw error;
      }

      if (signal.aborted) {
        throw signal.reason instanceof Error
          ? signal.reason
          : createCancellationError();
      }

      throw new OllamaEndpointPolicyError(
        'dns_failed',
        'The local Ollama endpoint could not be resolved.',
        { cause: error },
      );
    }

    if (resolvedAddresses.length === 0) {
      throw new OllamaEndpointPolicyError(
        'empty_resolution',
        'The local Ollama endpoint did not resolve to an address.',
      );
    }

    if (resolvedAddresses.length > MAXIMUM_RESOLVED_ADDRESSES) {
      throw new OllamaEndpointPolicyError(
        'excessive_resolution',
        'The local Ollama endpoint resolved to too many addresses.',
      );
    }

    if (
      resolvedAddresses.some(
        ({ address }) => !isLoopbackAddress(address),
      )
    ) {
      throw new OllamaEndpointPolicyError(
        'non_loopback_resolution',
        'The Ollama endpoint resolved outside the loopback interface.',
      );
    }

    const uniqueAddresses = new Map<string, ResolvedOllamaAddress>();

    for (const resolvedAddress of resolvedAddresses) {
      const key = `${resolvedAddress.family}:${resolvedAddress.address.toLowerCase()}`;
      uniqueAddresses.set(key, resolvedAddress);
    }

    return [...uniqueAddresses.values()];
  }
}
