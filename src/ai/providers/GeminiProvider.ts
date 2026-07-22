import type { GoogleGenAI as GoogleGenAIClient } from '@google/genai' with {
  'resolution-mode': 'import',
};

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

const REQUEST_TIMEOUT_MS = 30_000;
const MODEL_PAGE_SIZE = 100;

export class GeminiProvider implements AIProvider {
  public readonly id = 'gemini' as const;
  public readonly displayName = 'Gemini';
  private client: GoogleGenAIClient | null = null;
  private model = '';

  public async initialize(
    configuration: AIProviderConfiguration,
  ): Promise<void> {
    const apiKey = configuration.apiKey.trim();
    this.model = configuration.model.trim();

    if (apiKey.length === 0) {
      this.client = null;
      return;
    }

    const { GoogleGenAI } = await import('@google/genai');
    this.client = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: REQUEST_TIMEOUT_MS },
    });
  }

  public isConfigured(): boolean {
    return this.client !== null && this.model.length > 0;
  }

  public async sendMessage(request: AIRequest): Promise<AIResponse> {
    const client = this.requireClient();
    const model = this.requireModel();

    try {
      const response = await client.models.generateContent({
        model,
        contents: request.prompt,
      });
      const content = response.text?.trim() ?? '';

      if (content.length === 0) {
        throw createEmptyResponseError(this.id, this.displayName);
      }

      const usageMetadata = response.usageMetadata;

      return {
        providerId: this.id,
        content,
        finishReason:
          response.candidates?.[0]?.finishReason === 'MAX_TOKENS'
            ? 'length'
            : 'stop',
        ...(usageMetadata === undefined
          ? {}
          : {
              usage: {
                inputTokens: usageMetadata.promptTokenCount ?? 0,
                outputTokens: usageMetadata.candidatesTokenCount ?? 0,
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
      const pager = await client.models.list({
        config: {
          pageSize: MODEL_PAGE_SIZE,
          queryBase: true,
        },
      });

      return normalizeModels(
        pager.page
          .filter(
            (model) =>
              model.supportedActions === undefined ||
              model.supportedActions.includes('generateContent'),
          )
          .map((model) => {
            const id = (model.name ?? '').replace(/^models\//, '');

            return {
              id,
              ...(model.displayName === undefined
                ? {}
                : { displayName: model.displayName }),
            };
          }),
      );
    } catch (error) {
      throw toProviderError(this.id, this.displayName, error);
    }
  }

  public async testConnection(): Promise<AIConnectionResult> {
    const client = this.requireClient();
    const model = this.requireModel();

    try {
      await client.models.get({ model });
      const models = await this.listModels();

      return {
        message: 'Gemini connected successfully.',
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

  private requireClient(): GoogleGenAIClient {
    if (this.client === null) {
      throw createConfigurationError(
        this.id,
        'Gemini requires an API key.',
      );
    }

    return this.client;
  }

  private requireModel(): string {
    if (this.model.length === 0) {
      throw createConfigurationError(
        this.id,
        'Gemini requires a model.',
      );
    }

    return this.model;
  }
}
