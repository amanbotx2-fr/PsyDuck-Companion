import type { AIContext } from './AIContext';
import {
  isAIProviderId,
  type AIConnectionResult,
  type AIModel,
  type AIProvider,
  type AIProviderConfiguration,
  type AIProviderId,
  type AIRequest,
  type AIResponse,
} from './AIProvider';

export type AIServiceErrorCode =
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
}

export interface AIAskOptions {
  readonly context?: AIContext;
}

export class AIService {
  private readonly providers = new Map<AIProviderId, AIProvider>();
  private activeProvider: AIProvider | null = null;
  private activeConfiguration: AIProviderConfiguration | null = null;
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
      };

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
          nextConfiguration,
          this.activeConfiguration,
        )
      ) {
        return;
      }

      const previousProvider = this.activeProvider;
      this.activeProvider = null;
      this.activeConfiguration = null;

      if (previousProvider !== null) {
        await previousProvider.dispose();
      }

      if (nextProvider !== null) {
        await nextProvider.initialize(nextConfiguration);
        this.activeProvider = nextProvider;
        this.activeConfiguration = nextConfiguration;
      }
    });
  }

  public async ask(
    prompt: string,
    options: AIAskOptions = {},
  ): Promise<AIResponse> {
    await this.operationQueue;
    this.assertNotDisposed();

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

    return provider.sendMessage(request);
  }

  public async listModels(): Promise<readonly AIModel[]> {
    await this.operationQueue;
    this.assertNotDisposed();
    return this.requireActiveProvider().listModels();
  }

  public async testConnection(): Promise<AIConnectionResult> {
    await this.operationQueue;
    this.assertNotDisposed();
    return this.requireActiveProvider().testConnection();
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
      this.activeConfiguration = null;

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
    left: AIProviderConfiguration,
    right: AIProviderConfiguration | null,
  ): boolean {
    return (
      right !== null &&
      left.model === right.model &&
      left.apiKey === right.apiKey &&
      left.endpoint === right.endpoint
    );
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
