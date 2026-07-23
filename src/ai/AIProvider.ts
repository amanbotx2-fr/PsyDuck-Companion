import type { AIContext } from './AIContext';
import { limitProviderErrorMessage } from './AIAbuseLimits';
import {
  AI_PROVIDER_OPTIONS,
  isAiProvider,
  type AiProvider,
} from '../shared/settings';

export const AI_PROVIDER_IDS = AI_PROVIDER_OPTIONS.map(
  (provider) => provider.id,
) as readonly AiProvider[];

export type AIProviderId = AiProvider;

export const isAIProviderId = (value: string): value is AIProviderId =>
  isAiProvider(value);

export interface AIProviderConfiguration {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly endpoint: string;
}

export interface AIModel {
  readonly id: string;
  readonly displayName?: string;
}

export interface AIConnectionResult {
  readonly message: string;
}

export interface AIProviderHttpDiagnostics {
  readonly requestUrl: string;
  readonly httpStatusCode: number | null;
  readonly httpStatusText: string | null;
  readonly responseBody: string;
  readonly errorCode: string | null;
  readonly errorMessage: string;
}

export interface AIRequest {
  readonly prompt: string;
  readonly context?: AIContext;
}

export interface AIOperationOptions {
  readonly signal?: AbortSignal;
}

export type AIResponseFinishReason =
  | 'stop'
  | 'length'
  | 'cancelled';

export interface AIUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface AIResponse {
  readonly providerId: AIProviderId;
  readonly content: string;
  readonly finishReason: AIResponseFinishReason;
  readonly usage?: AIUsage;
}

export interface AIStreamChunk {
  readonly providerId: AIProviderId;
  readonly contentDelta: string;
  readonly done: boolean;
}

export interface AIProvider {
  readonly id: AIProviderId;
  readonly displayName: string;
  initialize(configuration: AIProviderConfiguration): Promise<void>;
  isConfigured(): boolean;
  sendMessage(
    request: AIRequest,
    options?: AIOperationOptions,
  ): Promise<AIResponse>;
  listModels(
    options?: AIOperationOptions,
  ): Promise<readonly AIModel[]>;
  testConnection(
    options?: AIOperationOptions,
  ): Promise<AIConnectionResult>;
  streamMessage(request: AIRequest): AsyncIterable<AIStreamChunk>;
  dispose(): Promise<void>;
}

export type AIProviderErrorCode =
  | 'configuration'
  | 'connection'
  | 'empty_response'
  | 'unsupported_operation';

export interface AIProviderErrorOptions extends ErrorOptions {
  readonly httpDiagnostics?: AIProviderHttpDiagnostics;
}

export class AIProviderError extends Error {
  public readonly providerId: AIProviderId;
  public readonly code: AIProviderErrorCode;
  public readonly httpDiagnostics:
    | AIProviderHttpDiagnostics
    | undefined;

  public constructor(
    providerId: AIProviderId,
    code: AIProviderErrorCode,
    message: string,
    options?: AIProviderErrorOptions,
  ) {
    super(limitProviderErrorMessage(message), options);
    this.name = 'AIProviderError';
    this.providerId = providerId;
    this.code = code;
    this.httpDiagnostics = options?.httpDiagnostics;
  }
}
