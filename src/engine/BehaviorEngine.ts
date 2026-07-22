export const BEHAVIOR_IDS = {
  idle: 'idle',
  lookLeft: 'look_left',
  lookRight: 'look_right',
  blink: 'blink',
  think: 'think',
  sleep: 'sleep',
  wave: 'wave',
} as const;

export type BehaviorId = (typeof BEHAVIOR_IDS)[keyof typeof BEHAVIOR_IDS];

export interface BehaviorDefinition<TBehavior extends string = BehaviorId> {
  readonly id: TBehavior;
  readonly execute: () => void | Promise<void>;
  readonly canRun?: () => boolean;
}

export interface BehaviorEngineOptions<TBehavior extends string = BehaviorId> {
  readonly idleBehavior: TBehavior;
  readonly minimumIdleIntervalMs?: number;
  readonly maximumIdleIntervalMs?: number;
  readonly random?: () => number;
  readonly onBehaviorChange?: (behavior: TBehavior) => void;
  readonly onBehaviorError?: (error: unknown, behavior: TBehavior) => void;
}

const DEFAULT_MINIMUM_IDLE_INTERVAL_MS = 6_000;
const DEFAULT_MAXIMUM_IDLE_INTERVAL_MS = 15_000;

export class BehaviorEngine<TBehavior extends string = BehaviorId> {
  private readonly idleBehavior: TBehavior;
  private readonly minimumIdleIntervalMs: number;
  private readonly maximumIdleIntervalMs: number;
  private readonly random: () => number;
  private readonly onBehaviorChange:
    | ((behavior: TBehavior) => void)
    | undefined;
  private readonly onBehaviorError:
    | ((error: unknown, behavior: TBehavior) => void)
    | undefined;
  private readonly registry = new Map<
    TBehavior,
    BehaviorDefinition<TBehavior>
  >();
  private activeBehavior: TBehavior;
  private scheduledTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduleRevision = 0;
  private running = false;

  public constructor(options: BehaviorEngineOptions<TBehavior>) {
    const minimumIdleIntervalMs =
      options.minimumIdleIntervalMs ?? DEFAULT_MINIMUM_IDLE_INTERVAL_MS;
    const maximumIdleIntervalMs =
      options.maximumIdleIntervalMs ?? DEFAULT_MAXIMUM_IDLE_INTERVAL_MS;

    if (!Number.isFinite(minimumIdleIntervalMs) || minimumIdleIntervalMs < 0) {
      throw new RangeError('The minimum idle interval must be a non-negative number.');
    }

    if (
      !Number.isFinite(maximumIdleIntervalMs) ||
      maximumIdleIntervalMs < minimumIdleIntervalMs
    ) {
      throw new RangeError(
        'The maximum idle interval must be greater than or equal to the minimum.',
      );
    }

    this.idleBehavior = options.idleBehavior;
    this.activeBehavior = options.idleBehavior;
    this.minimumIdleIntervalMs = minimumIdleIntervalMs;
    this.maximumIdleIntervalMs = maximumIdleIntervalMs;
    this.random = options.random ?? Math.random;
    this.onBehaviorChange = options.onBehaviorChange;
    this.onBehaviorError = options.onBehaviorError;
  }

  public get currentBehavior(): TBehavior {
    return this.activeBehavior;
  }

  public get isRunning(): boolean {
    return this.running;
  }

  public registerBehavior(
    behavior: BehaviorDefinition<TBehavior>,
  ): () => void {
    this.registry.set(behavior.id, behavior);

    return () => {
      if (this.registry.get(behavior.id) === behavior) {
        this.registry.delete(behavior.id);
      }
    };
  }

  public start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.setCurrentBehavior(this.idleBehavior);
    this.scheduleNextBehavior();
  }

  public stop(): void {
    this.running = false;
    this.cancelScheduledBehavior();
    this.setCurrentBehavior(this.idleBehavior);
  }

  public scheduleNextBehavior(): void {
    if (!this.running) {
      return;
    }

    this.cancelScheduledBehavior();

    const revision = this.scheduleRevision;
    const delay = this.createIdleInterval();
    this.scheduledTimer = setTimeout(() => {
      this.scheduledTimer = null;
      void this.executeScheduledBehavior(revision);
    }, delay);
  }

  public cancelScheduledBehavior(): void {
    this.scheduleRevision += 1;

    if (this.scheduledTimer !== null) {
      clearTimeout(this.scheduledTimer);
      this.scheduledTimer = null;
    }
  }

  private async executeScheduledBehavior(revision: number): Promise<void> {
    if (!this.running || revision !== this.scheduleRevision) {
      return;
    }

    const behavior = this.selectBehavior();

    if (behavior !== undefined) {
      this.setCurrentBehavior(behavior.id);

      try {
        await behavior.execute();
      } catch (error) {
        this.onBehaviorError?.(error, behavior.id);
      }
    }

    if (!this.running || revision !== this.scheduleRevision) {
      return;
    }

    this.setCurrentBehavior(this.idleBehavior);
    this.scheduleNextBehavior();
  }

  private selectBehavior(): BehaviorDefinition<TBehavior> | undefined {
    const candidates: BehaviorDefinition<TBehavior>[] = [];

    for (const behavior of this.registry.values()) {
      if (behavior.id === this.idleBehavior) {
        continue;
      }

      if (this.canBehaviorRun(behavior)) {
        candidates.push(behavior);
      }
    }

    if (candidates.length > 0) {
      const candidateIndex = Math.min(
        Math.floor(this.createRandomValue() * candidates.length),
        candidates.length - 1,
      );

      return candidates[candidateIndex];
    }

    const idleDefinition = this.registry.get(this.idleBehavior);
    return idleDefinition !== undefined && this.canBehaviorRun(idleDefinition)
      ? idleDefinition
      : undefined;
  }

  private canBehaviorRun(behavior: BehaviorDefinition<TBehavior>): boolean {
    try {
      return behavior.canRun?.() ?? true;
    } catch (error) {
      this.onBehaviorError?.(error, behavior.id);
      return false;
    }
  }

  private createIdleInterval(): number {
    const intervalRange =
      this.maximumIdleIntervalMs - this.minimumIdleIntervalMs;
    return Math.round(
      this.minimumIdleIntervalMs + intervalRange * this.createRandomValue(),
    );
  }

  private createRandomValue(): number {
    const value = this.random();

    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.min(Math.max(value, 0), 1);
  }

  private setCurrentBehavior(behavior: TBehavior): void {
    if (this.activeBehavior === behavior) {
      return;
    }

    this.activeBehavior = behavior;
    this.onBehaviorChange?.(behavior);
  }
}
