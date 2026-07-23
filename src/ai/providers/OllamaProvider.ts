import { Ollama } from 'ollama';

import { DEFAULT_OLLAMA_ENDPOINT } from '../../shared/settings';
import {
  MAXIMUM_AI_MODEL_COUNT,
  MAXIMUM_AI_OUTPUT_TOKENS,
} from '../AIAbuseLimits';
import {
  AIProviderError,
  type AIOperationOptions,
  type AIConnectionResult,
  type AIModel,
  type AIProvider,
  type AIProviderConfiguration,
  type AIRequest,
  type AIResponse,
  type AIStreamChunk,
} from '../AIProvider';
import {
  createConfigurationError,
  createEmptyResponseError,
  createStreamingUnsupportedError,
  normalizeModels,
  toProviderError,
} from './providerUtils';
import {
  LoopbackOllamaEndpointPolicy,
  OllamaEndpointPolicyError,
  type OllamaEndpointPolicy,
} from './ollama/OllamaEndpointPolicy';
import {
  DEFAULT_OLLAMA_TRANSPORT_LIMITS,
  OllamaTransport,
  OllamaTransportError,
  type OllamaTransportLimits,
} from './ollama/OllamaTransport';

export const MAXIMUM_DISCOVERED_OLLAMA_MODELS =
  MAXIMUM_AI_MODEL_COUNT;

interface OllamaProviderOptions {
  readonly endpointPolicy?: OllamaEndpointPolicy;
  readonly transportLimits?: OllamaTransportLimits;
}

interface ParsedChatResponse {
  readonly content: string;
  readonly doneReason: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readTokenCount = (value: unknown): number | undefined =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0
    ? value
    : undefined;

const parseChatResponse = (value: unknown): ParsedChatResponse => {
  if (
    !isRecord(value) ||
    !isRecord(value.message) ||
    typeof value.message.content !== 'string'
  ) {
    throw new AIProviderError(
      'ollama',
      'connection',
      'Ollama returned an invalid chat response.',
    );
  }

  const inputTokens = readTokenCount(value.prompt_eval_count);
  const outputTokens = readTokenCount(value.eval_count);

  return {
    content: value.message.content,
    doneReason:
      typeof value.done_reason === 'string' ? value.done_reason : '',
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
  };
};

const parseModelResponse = (value: unknown): readonly AIModel[] => {
  if (!isRecord(value) || !Array.isArray(value.models)) {
    throw new AIProviderError(
      'ollama',
      'connection',
      'Ollama returned an invalid model list.',
    );
  }

  if (value.models.length > MAXIMUM_DISCOVERED_OLLAMA_MODELS) {
    throw new OllamaTransportError(
      'response_too_large',
      'Ollama returned too many models.',
    );
  }

  const models: AIModel[] = [];

  for (const model of value.models) {
    if (
      !isRecord(model) ||
      typeof model.model !== 'string' ||
      (model.name !== undefined && typeof model.name !== 'string')
    ) {
      throw new AIProviderError(
        'ollama',
        'connection',
        'Ollama returned an invalid model list.',
      );
    }

    models.push({
      id: model.model,
      ...(typeof model.name === 'string'
        ? { displayName: model.name }
        : {}),
    });
  }

  return normalizeModels(models);
};

export class OllamaProvider implements AIProvider {
  public readonly id = 'ollama' as const;
  public readonly displayName = 'Ollama';
  private readonly endpointPolicy: OllamaEndpointPolicy;
  private readonly transportLimits: OllamaTransportLimits;
  private model = '';
  private endpoint = DEFAULT_OLLAMA_ENDPOINT;
  private transport: OllamaTransport | null = null;

  public constructor(options: OllamaProviderOptions = {}) {
    this.endpointPolicy =
      options.endpointPolicy ?? new LoopbackOllamaEndpointPolicy();
    this.transportLimits =
      options.transportLimits ?? DEFAULT_OLLAMA_TRANSPORT_LIMITS;
  }

  public initialize(
    configuration: AIProviderConfiguration,
  ): Promise<void> {
    this.reset();
    this.model = configuration.model.trim();

    try {
      const parsedEndpoint = this.endpointPolicy.parse(
        configuration.endpoint.trim(),
      );
      const transport = new OllamaTransport(
        parsedEndpoint,
        this.endpointPolicy,
        this.transportLimits,
      );

      this.endpoint = parsedEndpoint.origin;
      this.transport = transport;
      return Promise.resolve();
    } catch (error) {
      this.reset();
      return Promise.reject(
        this.toOllamaProviderError(error, 'configuration'),
      );
    }
  }

  public isConfigured(): boolean {
    return (
      this.transport !== null &&
      this.model.length > 0
    );
  }

  public async sendMessage(
    request: AIRequest,
    options: AIOperationOptions = {},
  ): Promise<AIResponse> {
    const client = this.createClient(options);
    const model = this.requireModel();

    try {
      const response: unknown = await client.chat({
        model,
        messages: [{ role: 'user', content: request.prompt }],
        options: { num_predict: MAXIMUM_AI_OUTPUT_TOKENS },
        stream: false,
      });
      const parsedResponse = parseChatResponse(response);
      const content = parsedResponse.content.trim();

      if (content.length === 0) {
        throw createEmptyResponseError(this.id, this.displayName);
      }

      return {
        providerId: this.id,
        content,
        finishReason:
          parsedResponse.doneReason === 'length' ? 'length' : 'stop',
        ...(parsedResponse.inputTokens === undefined ||
        parsedResponse.outputTokens === undefined
          ? {}
          : {
              usage: {
                inputTokens: parsedResponse.inputTokens,
                outputTokens: parsedResponse.outputTokens,
              },
            }),
      };
    } catch (error) {
      throw this.toOllamaProviderError(error, 'chat');
    }
  }

  public async listModels(
    options: AIOperationOptions = {},
  ): Promise<readonly AIModel[]> {
    const client = this.createClient(options);

    try {
      const response: unknown = await client.list();
      return parseModelResponse(response);
    } catch (error) {
      throw this.toOllamaProviderError(error, 'model_discovery');
    }
  }

  public async testConnection(
    options: AIOperationOptions = {},
  ): Promise<AIConnectionResult> {
    const models = await this.listModels(options);

    return {
      message:
        models.length === 0
          ? 'Ollama connected. No local models are installed.'
          : 'Ollama connected successfully.',
    };
  }

  public async *streamMessage(
    _request: AIRequest,
  ): AsyncIterable<AIStreamChunk> {
    throw createStreamingUnsupportedError(this.id, this.displayName);
  }

  public dispose(): Promise<void> {
    this.reset();
    return Promise.resolve();
  }

  private reset(): void {
    this.transport?.abortAll();
    this.transport = null;
    this.model = '';
    this.endpoint = DEFAULT_OLLAMA_ENDPOINT;
  }

  private createClient(options: AIOperationOptions): Ollama {
    if (this.transport === null) {
      throw createConfigurationError(
        this.id,
        'Ollama requires an endpoint.',
      );
    }

    return new Ollama({
      host: this.endpoint,
      fetch: this.transport.createFetch(options.signal),
    });
  }

  private requireModel(): string {
    if (this.model.length === 0) {
      throw createConfigurationError(
        this.id,
        'Ollama requires an installed model.',
      );
    }

    return this.model;
  }

  private toOllamaProviderError(
    error: unknown,
    operation: string,
  ): AIProviderError {
    if (error instanceof AIProviderError) {
      return error;
    }

    if (error instanceof OllamaEndpointPolicyError) {
      console.warn('[security] ollama_endpoint_rejected', {
        operation,
        reason: error.code,
      });

      return new AIProviderError(
        this.id,
        error.code === 'invalid_endpoint'
          ? 'configuration'
          : 'connection',
        error.code === 'invalid_endpoint'
          ? 'Ollama only supports local endpoints using localhost or 127.0.0.1.'
          : 'The local Ollama endpoint could not be validated.',
        { cause: error },
      );
    }

    if (error instanceof OllamaTransportError) {
      console.warn('[security] ollama_request_rejected', {
        operation,
        reason: error.code,
      });

      let message: string;

      switch (error.code) {
        case 'cancelled':
          message = 'The Ollama request was cancelled.';
          break;
        case 'response_too_large':
          message = 'Ollama returned more data than PsyDuck can safely process.';
          break;
        case 'timeout':
          message = 'Ollama did not respond in time.';
          break;
        case 'redirect_rejected':
          message = 'The Ollama server returned an unsupported redirect.';
          break;
        default:
          message = 'The local Ollama connection was rejected.';
      }

      return new AIProviderError(
        this.id,
        'connection',
        message,
        { cause: error },
      );
    }

    return toProviderError(this.id, this.displayName, error);
  }
}
