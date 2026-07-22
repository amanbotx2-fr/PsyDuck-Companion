import OpenAI from 'openai';

import {
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
} from './providerUtils';

const REQUEST_TIMEOUT_MS = 30_000;
const MAXIMUM_RETRIES = 1;

export class OpenAICompatibleProvider implements AIProvider {
  private client: OpenAI | null = null;
  private model = '';

  public constructor(
    public readonly id: AIProviderId,
    public readonly displayName: string,
    private readonly baseURL?: string,
  ) {}

  public initialize(
    configuration: AIProviderConfiguration,
  ): Promise<void> {
    const apiKey = configuration.apiKey.trim();
    this.model = configuration.model.trim();
    this.client =
      apiKey.length === 0
        ? null
        : new OpenAI({
            apiKey,
            ...(this.baseURL === undefined
              ? {}
              : { baseURL: this.baseURL }),
            timeout: REQUEST_TIMEOUT_MS,
            maxRetries: MAXIMUM_RETRIES,
          });

    return Promise.resolve();
  }

  public isConfigured(): boolean {
    return this.client !== null && this.model.length > 0;
  }

  public async sendMessage(request: AIRequest): Promise<AIResponse> {
    const client = this.requireClient();
    const model = this.requireModel();

    try {
      const response = await client.responses.create({
        model,
        input: request.prompt,
      });
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
    } catch (error) {
      throw toProviderError(this.id, this.displayName, error);
    }
  }

  public async listModels(): Promise<readonly AIModel[]> {
    const client = this.requireClient();

    try {
      const page = await client.models.list();
      return normalizeModels(page.data.map((model) => ({ id: model.id })));
    } catch (error) {
      throw toProviderError(this.id, this.displayName, error);
    }
  }

  public async testConnection(): Promise<AIConnectionResult> {
    const client = this.requireClient();
    const model = this.requireModel();

    try {
      await client.models.retrieve(model);
      const models = await this.listModels();

      return {
        message: `${this.displayName} connected successfully.`,
        models,
      };
    } catch (error) {
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
    this.model = '';
    return Promise.resolve();
  }

  private requireClient(): OpenAI {
    if (this.client === null) {
      throw createConfigurationError(
        this.id,
        `${this.displayName} requires an API key.`,
      );
    }

    return this.client;
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
