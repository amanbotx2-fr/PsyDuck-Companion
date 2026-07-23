import { createHash } from 'node:crypto';

import {
  limitAIConnectionResult,
  limitAIResponse,
  normalizeAIModels,
} from './AIAbuseLimits';
import type { AIContext } from './AIContext';
import {
  isAIProviderId,
  type AIOperationOptions,
  type AIConnectionResult,
  type AIModel,
  type AIProvider,
  type AIProviderConfiguration,
  type AIProviderId,
  type AIRequest,
  type AIResponse,
} from './AIProvider';

export type AIServiceErrorCode =
  | 'cancelled'
  | 'disabled'
  | 'disposed'
  | 'empty_prompt'
  | 'provider_not_configured'
  | 'provider_not_selected'
  | 'unsupported_provider';

export class AIServiceError extends Error {
  public readonly code: AIServiceErrorCode;

  public constructor(code: AIServiceErrorCode, message: string) {
    super(message);
    this.name = 'AIServiceError';
    this.code = code;
  }
}

export interface AIServiceConfiguration {
  readonly enabled: boolean;
  readonly provider: string | null;
  readonly model: string;
  readonly apiKey: string;
  readonly endpoint: string;
  readonly baseUrl: string;
}

export interface AIAskOptions extends AIOperationOptions {
  readonly context?: AIContext;
}

interface AIProviderConfigurationFingerprint {
  readonly apiKeyDigest: string;
  readonly baseUrl: string;
  readonly endpoint: string;
  readonly model: string;
}

export class AIService {
  private readonly providers = new Map<AIProviderId, AIProvider>();
  private activeProvider: AIProvider | null = null;
  private activeConfigurationFingerprint:
    | AIProviderConfigurationFingerprint
    | null = null;
  private enabled = false;
  private disposed = false;
  private operationQueue: Promise<void> = Promise.resolve();

  public constructor(providers: readonly AIProvider[]) {
    for (const provider of providers) {
      if (this.providers.has(provider.id)) {
        throw new TypeError(`Duplicate AI provider: ${provider.id}`);
      }

      this.providers.set(provider.id, provider);
    }
  }

  public get activeProviderId(): AIProviderId | null {
    return this.activeProvider?.id ?? null;
  }

  public get isEnabled(): boolean {
    return this.enabled;
  }

  public get isConfigured(): boolean {
    return this.enabled && (this.activeProvider?.isConfigured() ?? false);
  }

  public get registeredProviderIds(): readonly AIProviderId[] {
    return [...this.providers.keys()];
  }

  public configure(configuration: AIServiceConfiguration): Promise<void> {
    return this.enqueueOperation(async () => {
      this.assertNotDisposed();

      const providerId = this.parseProviderSelection(
        configuration.provider,
      );
      const nextProvider =
        providerId === null ? null : this.providers.get(providerId) ?? null;
      const nextConfiguration: AIProviderConfiguration = {
        model: configuration.model.trim(),
        apiKey: configuration.apiKey.trim(),
        endpoint: configuration.endpoint.trim(),
        baseUrl: configuration.baseUrl.trim(),
      };
      const nextConfigurationFingerprint =
        this.fingerprintConfiguration(nextConfiguration);

      if (providerId !== null && nextProvider === null) {
        throw new AIServiceError(
          'unsupported_provider',
          `AI provider "${providerId}" is not registered.`,
        );
      }

      this.enabled = configuration.enabled;

      if (
        nextProvider === this.activeProvider &&
        this.configurationsAreEqual(
          nextConfigurationFingerprint,
          this.activeConfigurationFingerprint,
        )
      ) {
        return;
      }

      const previousProvider = this.activeProvider;
      this.activeProvider = null;
      this.activeConfigurationFingerprint = null;

      if (previousProvider !== null) {
        await previousProvider.dispose();
      }

      if (nextProvider !== null) {
        await nextProvider.initialize(nextConfiguration);
        this.activeProvider = nextProvider;
        this.activeConfigurationFingerprint =
          nextConfigurationFingerprint;
      }
    });
  }

  public async ask(
    prompt: string,
    options: AIAskOptions = {},
  ): Promise<AIResponse> {
    this.assertOperationActive(options.signal);
    await this.operationQueue;
    this.assertNotDisposed();
    this.assertOperationActive(options.signal);

    if (!this.enabled) {
      throw new AIServiceError('disabled', 'AI features are disabled.');
    }

    const normalizedPrompt = prompt.trim();

    if (normalizedPrompt.length === 0) {
      throw new AIServiceError(
        'empty_prompt',
        'An AI prompt cannot be empty.',
      );
    }

    const provider = this.activeProvider;

    if (provider === null) {
      throw new AIServiceError(
        'provider_not_selected',
        'No AI provider is selected.',
      );
    }

    if (!provider.isConfigured()) {
      throw new AIServiceError(
        'provider_not_configured',
        `${provider.displayName} is not configured.`,
      );
    }

    const request: AIRequest = {
      prompt: normalizedPrompt,
      ...(options.context === undefined
        ? {}
        : { context: options.context }),
    };

    const response = await provider.sendMessage(
      request,
      this.toOperationOptions(options.signal),
    );
    this.assertOperationActive(options.signal);
    return limitAIResponse(response);
  }

  public async listModels(
    options: AIOperationOptions = {},
  ): Promise<readonly AIModel[]> {
    this.assertOperationActive(options.signal);
    await this.operationQueue;
    this.assertNotDisposed();
    this.assertOperationActive(options.signal);

    const models = await this.requireActiveProvider().listModels(options);
    this.assertOperationActive(options.signal);
    return normalizeAIModels(models);
  }

  public async testConnection(
    options: AIOperationOptions = {},
  ): Promise<AIConnectionResult> {
    this.assertOperationActive(options.signal);
    await this.operationQueue;
    this.assertNotDisposed();
    this.assertOperationActive(options.signal);

    const result =
      await this.requireActiveProvider().testConnection(options);
    this.assertOperationActive(options.signal);
    return limitAIConnectionResult(result);
  }

  public dispose(): Promise<void> {
    return this.enqueueOperation(async () => {
      if (this.disposed) {
        return;
      }

      this.disposed = true;
      this.enabled = false;

      const provider = this.activeProvider;
      this.activeProvider = null;
      this.activeConfigurationFingerprint = null;

      if (provider !== null) {
        await provider.dispose();
      }
    });
  }

  private parseProviderSelection(value: string | null): AIProviderId | null {
    const normalizedValue = value?.trim().toLowerCase() ?? '';

    if (normalizedValue.length === 0) {
      return null;
    }

    if (!isAIProviderId(normalizedValue)) {
      throw new AIServiceError(
        'unsupported_provider',
        `Unsupported AI provider: "${value}".`,
      );
    }

    return normalizedValue;
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new AIServiceError(
        'disposed',
        'The AI service has been disposed.',
      );
    }
  }

  private assertOperationActive(signal: AbortSignal | undefined): void {
    if (signal?.aborted === true) {
      throw new AIServiceError(
        'cancelled',
        'The AI operation was cancelled.',
      );
    }
  }

  private toOperationOptions(
    signal: AbortSignal | undefined,
  ): AIOperationOptions {
    return signal === undefined ? {} : { signal };
  }

  private requireActiveProvider(): AIProvider {
    const provider = this.activeProvider;

    if (provider === null) {
      throw new AIServiceError(
        'provider_not_selected',
        'No AI provider is selected.',
      );
    }

    return provider;
  }

  private configurationsAreEqual(
    left: AIProviderConfigurationFingerprint,
    right: AIProviderConfigurationFingerprint | null,
  ): boolean {
    return (
      right !== null &&
      left.model === right.model &&
      left.apiKeyDigest === right.apiKeyDigest &&
      left.baseUrl === right.baseUrl &&
      left.endpoint === right.endpoint
    );
  }

  private fingerprintConfiguration(
    configuration: AIProviderConfiguration,
  ): AIProviderConfigurationFingerprint {
    return {
      apiKeyDigest: createHash('sha256')
        .update(configuration.apiKey)
        .digest('hex'),
      baseUrl: configuration.baseUrl,
      endpoint: configuration.endpoint,
      model: configuration.model,
    };
  }

  private enqueueOperation(operation: () => Promise<void>): Promise<void> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
