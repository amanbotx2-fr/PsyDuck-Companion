import type { RendererRole } from './ipcAuthorization';

export type AIOperation =
  | 'chat'
  | 'connection_test'
  | 'model_discovery';

export type AIRequestPolicyErrorCode =
  | 'cancelled'
  | 'in_progress'
  | 'rate_limited';

type AILifecycleCancellationReason =
  | 'application_quit'
  | 'provider_changed'
  | 'renderer_crashed'
  | 'renderer_reloaded'
  | 'window_closed';

interface RateLimitPolicy {
  readonly maximumRequests: number;
  readonly windowMs: number;
}

interface ActiveOperation {
  readonly controller: AbortController;
  readonly operation: AIOperation;
}

interface AISecurityEvent {
  readonly operation: AIOperation;
  readonly rendererRole: RendererRole;
  readonly reason: string;
}

interface AIRequestManagerDependencies {
  readonly now?: () => number;
  readonly logRejection?: (event: AISecurityEvent) => void;
  readonly logCancellation?: (event: AISecurityEvent) => void;
}

const RATE_LIMITS: Readonly<Record<AIOperation, RateLimitPolicy>> = {
  chat: {
    maximumRequests: 30,
    windowMs: 60_000,
  },
  connection_test: {
    maximumRequests: 12,
    windowMs: 60_000,
  },
  model_discovery: {
    maximumRequests: 12,
    windowMs: 60_000,
  },
};

const POLICY_ERROR_MESSAGES: Readonly<
  Record<AIRequestPolicyErrorCode, string>
> = {
  cancelled: 'The AI request was cancelled.',
  in_progress: 'Request already in progress.',
  rate_limited: 'Too many AI requests. Try again shortly.',
};

export class AIRequestPolicyError extends Error {
  public constructor(public readonly code: AIRequestPolicyErrorCode) {
    super(POLICY_ERROR_MESSAGES[code]);
    this.name = 'AIRequestPolicyError';
  }
}

export class AIRequestManager {
  private readonly activeByRole = new Map<RendererRole, ActiveOperation>();
  private readonly requestTimestamps = new Map<string, number[]>();
  private readonly now: () => number;
  private readonly logRejection: (event: AISecurityEvent) => void;
  private readonly logCancellation: (event: AISecurityEvent) => void;

  public constructor(dependencies: AIRequestManagerDependencies = {}) {
    this.now = dependencies.now ?? Date.now;
    this.logRejection =
      dependencies.logRejection ??
      ((event) => {
        console.warn('[security] ai_operation_rejected', event);
      });
    this.logCancellation =
      dependencies.logCancellation ??
      ((event) => {
        console.warn('[security] ai_operation_cancelled', event);
      });
  }

  public get activeOperationCount(): number {
    return this.activeByRole.size;
  }

  public async run<Result>(
    rendererRole: RendererRole,
    operation: AIOperation,
    execute: (signal: AbortSignal) => Promise<Result>,
  ): Promise<Result> {
    if (this.activeByRole.has(rendererRole)) {
      this.reject(rendererRole, operation, 'operation_in_progress');
      throw new AIRequestPolicyError('in_progress');
    }

    if (!this.consumeRateLimit(rendererRole, operation)) {
      this.reject(rendererRole, operation, 'rate_limit_exceeded');
      throw new AIRequestPolicyError('rate_limited');
    }

    const activeOperation: ActiveOperation = {
      controller: new AbortController(),
      operation,
    };
    this.activeByRole.set(rendererRole, activeOperation);

    try {
      const result = await execute(activeOperation.controller.signal);

      if (activeOperation.controller.signal.aborted) {
        throw new AIRequestPolicyError('cancelled');
      }

      return result;
    } catch (error) {
      if (
        activeOperation.controller.signal.aborted &&
        !(error instanceof AIRequestPolicyError)
      ) {
        throw new AIRequestPolicyError('cancelled');
      }

      throw error;
    } finally {
      if (this.activeByRole.get(rendererRole) === activeOperation) {
        this.activeByRole.delete(rendererRole);
      }
    }
  }

  public cancelRole(
    rendererRole: RendererRole,
    reason: AILifecycleCancellationReason,
  ): void {
    const activeOperation = this.activeByRole.get(rendererRole);

    if (activeOperation === undefined) {
      return;
    }

    this.logCancellation({
      operation: activeOperation.operation,
      rendererRole,
      reason,
    });
    activeOperation.controller.abort();
  }

  public cancelAll(reason: AILifecycleCancellationReason): void {
    for (const rendererRole of this.activeByRole.keys()) {
      this.cancelRole(rendererRole, reason);
    }
  }

  private consumeRateLimit(
    rendererRole: RendererRole,
    operation: AIOperation,
  ): boolean {
    const policy = RATE_LIMITS[operation];
    const key = `${rendererRole}:${operation}`;
    const now = this.now();
    const windowStart = now - policy.windowMs;
    const recentRequests = (
      this.requestTimestamps.get(key) ?? []
    ).filter((timestamp) => timestamp > windowStart);

    if (recentRequests.length >= policy.maximumRequests) {
      this.requestTimestamps.set(key, recentRequests);
      return false;
    }

    recentRequests.push(now);
    this.requestTimestamps.set(key, recentRequests);
    return true;
  }

  private reject(
    rendererRole: RendererRole,
    operation: AIOperation,
    reason: string,
  ): void {
    this.logRejection({ operation, rendererRole, reason });
  }
}
