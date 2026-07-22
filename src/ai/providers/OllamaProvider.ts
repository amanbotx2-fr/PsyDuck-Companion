import { Ollama } from 'ollama';

import { DEFAULT_OLLAMA_ENDPOINT } from '../../shared/settings';
import {
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

export class OllamaProvider implements AIProvider {
  public readonly id = 'ollama' as const;
  public readonly displayName = 'Ollama';
  private client: Ollama | null = null;
  private model = '';
  private endpoint = DEFAULT_OLLAMA_ENDPOINT;

  public initialize(
    configuration: AIProviderConfiguration,
  ): Promise<void> {
    this.model = configuration.model.trim();
    this.endpoint = configuration.endpoint.trim();
    this.client = new Ollama({ host: this.endpoint });
    return Promise.resolve();
  }

  public isConfigured(): boolean {
    return this.client !== null && this.model.length > 0;
  }

  public async sendMessage(request: AIRequest): Promise<AIResponse> {
    const client = this.requireClient();
    const model = this.requireModel();

    try {
      const response = await client.chat({
        model,
        messages: [{ role: 'user', content: request.prompt }],
        stream: false,
      });
      const content = response.message.content.trim();

      if (content.length === 0) {
        throw createEmptyResponseError(this.id, this.displayName);
      }

      return {
        providerId: this.id,
        content,
        finishReason:
          response.done_reason === 'length' ? 'length' : 'stop',
        usage: {
          inputTokens: response.prompt_eval_count,
          outputTokens: response.eval_count,
        },
      };
    } catch (error) {
      throw toProviderError(this.id, this.displayName, error);
    }
  }

  public async listModels(): Promise<readonly AIModel[]> {
    const client = this.requireClient();

    try {
      const response = await client.list();
      return normalizeModels(
        response.models.map((model) => ({
          id: model.model,
          displayName: model.name,
        })),
      );
    } catch (error) {
      throw toProviderError(this.id, this.displayName, error);
    }
  }

  public async testConnection(): Promise<AIConnectionResult> {
    const models = await this.listModels();

    if (
      this.model.length > 0 &&
      !models.some((availableModel) => availableModel.id === this.model)
    ) {
      throw createConfigurationError(
        this.id,
        'The configured Ollama model is not installed at this endpoint.',
      );
    }

    return {
      message:
        models.length === 0
          ? 'Ollama connected. No local models are installed.'
          : `Ollama connected with ${models.length} installed ${
              models.length === 1 ? 'model' : 'models'
            }.`,
      models,
    };
  }

  public async *streamMessage(
    _request: AIRequest,
  ): AsyncIterable<AIStreamChunk> {
    throw createStreamingUnsupportedError(this.id, this.displayName);
  }

  public dispose(): Promise<void> {
    this.client?.abort();
    this.client = null;
    this.model = '';
    this.endpoint = DEFAULT_OLLAMA_ENDPOINT;
    return Promise.resolve();
  }

  private requireClient(): Ollama {
    if (this.client === null) {
      throw createConfigurationError(
        this.id,
        'Ollama requires an endpoint.',
      );
    }

    return this.client;
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
}
