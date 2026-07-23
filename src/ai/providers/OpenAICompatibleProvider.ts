import OpenAI from 'openai';

import { normalizeOpenAICompatibleBaseUrl } from '../../shared/settings';
import {
  MAXIMUM_AI_MODEL_CANDIDATES,
  MAXIMUM_AI_OUTPUT_TOKENS,
} from '../AIAbuseLimits';
import {
  type AIOperationOptions,
  type AIConnectionResult,
  type AIModel,
  type AIProvider,
  type AIProviderConfiguration,
  type AIProviderId,
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
  toProviderHttpError,
} from './providerUtils';

const REQUEST_TIMEOUT_MS = 30_000;
const MAXIMUM_RETRIES = 1;
const UNAUTHENTICATED_API_KEY_PLACEHOLDER = 'not-required';
const OPENAI_NON_TEXT_MODEL_MARKERS = [
  'audio',
  'image',
  'moderation',
  'realtime',
  'speech',
  'transcribe',
  'tts',
  'whisper',
] as const;

type OpenAIRequestProtocol =
  | 'responses'
  | 'chat-completions'
  | 'auto';
type ResolvedOpenAIRequestProtocol = Exclude<
  OpenAIRequestProtocol,
  'auto'
>;

export interface OpenAICompatibleProviderOptions {
  readonly apiKeyRequired?: boolean;
  readonly baseURL?: string;
  readonly connectionTestRequestUrl?: string;
  readonly logModelDiscovery?: (
    diagnostics: OpenAICompatibleModelDiscoveryDiagnostics,
  ) => void;
  readonly modelDiscoveryOptional?: boolean;
  readonly requestProtocol?: OpenAIRequestProtocol;
  readonly useConfiguredBaseUrl?: boolean;
}

export interface OpenAICompatibleModelDiscoveryDiagnostics {
  readonly providerId: AIProviderId;
  readonly rawResponseLength: number;
  readonly parsedModelCount: number;
  readonly displayedModelCount: number;
}

const logModelDiscoveryByDefault = (
  diagnostics: OpenAICompatibleModelDiscoveryDiagnostics,
): void => {
  console.info('[ai] model_discovery_counts', diagnostics);
};

const readHttpStatus = (error: unknown): number | null => {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return null;
  }

  return typeof error.status === 'number' ? error.status : null;
};

const isUnsupportedEndpointError = (error: unknown): boolean => {
  const status = readHttpStatus(error);
  return status === 404 || status === 405 || status === 501;
};

const isOpenAITextModel = (modelId: string): boolean => {
  const normalizedId = modelId.toLowerCase();
  const baseModelId = normalizedId.startsWith('ft:')
    ? normalizedId.slice(3)
    : normalizedId;
  const belongsToTextFamily =
    baseModelId.startsWith('gpt-') ||
    /^o[134](?:-|$)/.test(baseModelId);

  return (
    belongsToTextFamily &&
    !OPENAI_NON_TEXT_MODEL_MARKERS.some((marker) =>
      baseModelId.includes(marker),
    )
  );
};

export class OpenAICompatibleProvider implements AIProvider {
  private readonly apiKeyRequired: boolean;
  private readonly connectionTestRequestUrl: string | undefined;
  private readonly fixedBaseURL: string | undefined;
  private readonly logModelDiscovery: (
    diagnostics: OpenAICompatibleModelDiscoveryDiagnostics,
  ) => void;
  private readonly modelDiscoveryOptional: boolean;
  private readonly requestProtocol: OpenAIRequestProtocol;
  private readonly useConfiguredBaseUrl: boolean;
  private client: OpenAI | null = null;
  private configurationError: string | null = null;
  private model = '';
  private resolvedRequestProtocol:
    | ResolvedOpenAIRequestProtocol
    | null = null;

  public constructor(
    public readonly id: AIProviderId,
    public readonly displayName: string,
    options: OpenAICompatibleProviderOptions = {},
  ) {
    this.apiKeyRequired = options.apiKeyRequired ?? true;
    this.connectionTestRequestUrl =
      options.connectionTestRequestUrl;
    this.fixedBaseURL = options.baseURL;
    this.logModelDiscovery =
      options.logModelDiscovery ?? logModelDiscoveryByDefault;
    this.modelDiscoveryOptional =
      options.modelDiscoveryOptional ?? false;
    this.requestProtocol = options.requestProtocol ?? 'responses';
    this.useConfiguredBaseUrl = options.useConfiguredBaseUrl ?? false;
  }

  public initialize(
    configuration: AIProviderConfiguration,
  ): Promise<void> {
    const apiKey = configuration.apiKey.trim();
    const configuredBaseURL = this.useConfiguredBaseUrl
      ? normalizeOpenAICompatibleBaseUrl(configuration.baseUrl)
      : this.fixedBaseURL;
    this.model = configuration.model.trim();
    this.resolvedRequestProtocol = null;

    if (this.useConfiguredBaseUrl && configuredBaseURL === null) {
      this.client = null;
      this.configurationError =
        `${this.displayName} requires a valid base URL.`;
      return Promise.resolve();
    }

    if (this.apiKeyRequired && apiKey.length === 0) {
      this.client = null;
      this.configurationError = `${this.displayName} requires an API key.`;
      return Promise.resolve();
    }

    const unauthenticated = apiKey.length === 0;
    this.client = new OpenAI({
      apiKey: unauthenticated
        ? UNAUTHENTICATED_API_KEY_PLACEHOLDER
        : apiKey,
      ...(configuredBaseURL === undefined
        ? {}
        : { baseURL: configuredBaseURL }),
      ...(unauthenticated
        ? { defaultHeaders: { Authorization: null } }
        : {}),
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: MAXIMUM_RETRIES,
    });
    this.configurationError = null;

    return Promise.resolve();
  }

  public isConfigured(): boolean {
    return this.client !== null && this.model.length > 0;
  }

  public async sendMessage(
    request: AIRequest,
    options: AIOperationOptions = {},
  ): Promise<AIResponse> {
    const client = this.requireClient();
    const model = this.requireModel();

    try {
      if (this.requestProtocol === 'responses') {
        return await this.sendResponsesMessage(
          client,
          model,
          request,
          options,
        );
      }

      if (this.requestProtocol === 'chat-completions') {
        return await this.sendChatCompletionsMessage(
          client,
          model,
          request,
          options,
        );
      }

      if (this.resolvedRequestProtocol === 'responses') {
        return await this.sendResponsesMessage(
          client,
          model,
          request,
          options,
        );
      }

      if (this.resolvedRequestProtocol === 'chat-completions') {
        return await this.sendChatCompletionsMessage(
          client,
          model,
          request,
          options,
        );
      }

      try {
        const response = await this.sendChatCompletionsMessage(
          client,
          model,
          request,
          options,
        );
        this.resolvedRequestProtocol = 'chat-completions';
        return response;
      } catch (error) {
        if (!isUnsupportedEndpointError(error)) {
          throw error;
        }
      }

      const response = await this.sendResponsesMessage(
        client,
        model,
        request,
        options,
      );
      this.resolvedRequestProtocol = 'responses';
      return response;
    } catch (error) {
      throw toProviderError(this.id, this.displayName, error);
    }
  }

  public async listModels(
    options: AIOperationOptions = {},
  ): Promise<readonly AIModel[]> {
    const client = this.requireClient();

    try {
      const page = await client.models.list(
        options.signal === undefined
          ? undefined
          : { signal: options.signal },
      );
      const models: AIModel[] = [];
      let inspectedModels = 0;
      const rawResponseLength = page.data.length;

      for (const model of page.data) {
        inspectedModels += 1;

        if (inspectedModels > MAXIMUM_AI_MODEL_CANDIDATES) {
          break;
        }

        if (typeof model.id !== 'string') {
          continue;
        }

        if (this.id !== 'openai' || isOpenAITextModel(model.id)) {
          models.push({ id: model.id });
        }
      }

      // OpenAI's Models API exposes identifiers and ownership, but not endpoint
      // capability metadata. Filter the account-specific response conservatively
      // for OpenAI; compatible providers keep their server-defined catalog.
      const normalizedModels = normalizeModels(models);
      this.logModelDiscovery({
        providerId: this.id,
        rawResponseLength,
        parsedModelCount: models.length,
        displayedModelCount: normalizedModels.length,
      });
      return normalizedModels;
    } catch (error) {
      if (
        this.modelDiscoveryOptional &&
        isUnsupportedEndpointError(error)
      ) {
        return [];
      }

      throw toProviderError(this.id, this.displayName, error);
    }
  }

  public async testConnection(
    options: AIOperationOptions = {},
  ): Promise<AIConnectionResult> {
    const client = this.requireClient();

    try {
      await client.models.list(
        options.signal === undefined
          ? undefined
          : { signal: options.signal },
      );

      return {
        message: 'Connection successful.',
      };
    } catch (error) {
      if (this.connectionTestRequestUrl !== undefined) {
        throw toProviderHttpError(
          this.id,
          this.displayName,
          this.connectionTestRequestUrl,
          error,
        );
      }

      if (
        this.modelDiscoveryOptional &&
        isUnsupportedEndpointError(error)
      ) {
        return {
          message:
            'Connection successful. Models endpoint unavailable.',
        };
      }

      throw toProviderError(this.id, this.displayName, error);
    }
  }

  public async *streamMessage(
    _request: AIRequest,
  ): AsyncIterable<AIStreamChunk> {
    throw createStreamingUnsupportedError(this.id, this.displayName);
  }

  public dispose(): Promise<void> {
    this.client = null;
    this.configurationError = null;
    this.model = '';
    this.resolvedRequestProtocol = null;
    return Promise.resolve();
  }

  protected requireClient(): OpenAI {
    if (this.client === null) {
      throw createConfigurationError(
        this.id,
        this.configurationError ??
          `${this.displayName} is not configured.`,
      );
    }

    return this.client;
  }

  private async sendResponsesMessage(
    client: OpenAI,
    model: string,
    request: AIRequest,
    options: AIOperationOptions,
  ): Promise<AIResponse> {
    const response = await client.responses.create(
      {
        model,
        input: request.prompt,
        max_output_tokens: MAXIMUM_AI_OUTPUT_TOKENS,
      },
      options.signal === undefined
        ? undefined
        : { signal: options.signal },
    );
    const content = response.output_text.trim();

    if (content.length === 0) {
      throw createEmptyResponseError(this.id, this.displayName);
    }

    return {
      providerId: this.id,
      content,
      finishReason:
        response.status === 'cancelled'
          ? 'cancelled'
          : response.status === 'incomplete'
            ? 'length'
            : 'stop',
      ...(response.usage === undefined
        ? {}
        : {
            usage: {
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
            },
          }),
    };
  }

  private async sendChatCompletionsMessage(
    client: OpenAI,
    model: string,
    request: AIRequest,
    options: AIOperationOptions,
  ): Promise<AIResponse> {
    const response = await client.chat.completions.create(
      {
        model,
        messages: [{ role: 'user', content: request.prompt }],
        max_tokens: MAXIMUM_AI_OUTPUT_TOKENS,
      },
      options.signal === undefined
        ? undefined
        : { signal: options.signal },
    );
    const choice = response.choices[0];
    const content = choice?.message.content?.trim() ?? '';

    if (content.length === 0) {
      throw createEmptyResponseError(this.id, this.displayName);
    }

    return {
      providerId: this.id,
      content,
      finishReason: choice?.finish_reason === 'length' ? 'length' : 'stop',
      ...(response.usage === undefined
        ? {}
        : {
            usage: {
              inputTokens: response.usage.prompt_tokens,
              outputTokens: response.usage.completion_tokens,
            },
          }),
    };
  }

  private requireModel(): string {
    if (this.model.length === 0) {
      throw createConfigurationError(
        this.id,
        `${this.displayName} requires a model.`,
      );
    }

    return this.model;
  }
}
