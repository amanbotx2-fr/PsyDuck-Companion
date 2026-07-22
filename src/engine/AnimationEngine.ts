import {
  AnimationRegistry,
  type AnimationClip,
  type AnimationFrameModules,
  type AnimationRegistrationOptions,
} from './AnimationRegistry';

export type AnimationFrameListener = (
  framePath: string,
  frameIndex: number,
  animationName: string,
  presentation: AnimationPresentation,
) => void;

export interface AnimationPresentation {
  readonly flipX: boolean;
}

export interface AnimationEngineOptions {
  readonly registry?: AnimationRegistry;
  readonly fallbackAnimationName?: string;
  readonly onFrameChange?: AnimationFrameListener;
  readonly onAnimationChange?: (animationName: string) => void;
  readonly onAnimationComplete?: (animationName: string) => void;
}

export interface PlayAnimationOptions {
  readonly restart?: boolean;
  readonly flipX?: boolean;
}

const DEFAULT_PRESENTATION: AnimationPresentation = Object.freeze({
  flipX: false,
});
const FLIPPED_PRESENTATION: AnimationPresentation = Object.freeze({
  flipX: true,
});

export class AnimationEngine {
  private readonly registry: AnimationRegistry;
  private readonly fallbackAnimationName: string | undefined;
  private readonly onFrameChange: AnimationFrameListener | undefined;
  private readonly onAnimationChange:
    | ((animationName: string) => void)
    | undefined;
  private readonly onAnimationComplete:
    | ((animationName: string) => void)
    | undefined;
  private activeClip: AnimationClip | null = null;
  private flipX = false;
  private frameIndex = 0;
  private animationFrameId: number | null = null;
  private previousTimestamp: number | null = null;
  private elapsedTime = 0;
  private running = false;

  public constructor(options: AnimationEngineOptions = {}) {
    this.registry = options.registry ?? new AnimationRegistry();
    this.fallbackAnimationName = options.fallbackAnimationName;
    this.onFrameChange = options.onFrameChange;
    this.onAnimationChange = options.onAnimationChange;
    this.onAnimationComplete = options.onAnimationComplete;
  }

  public get currentAnimationName(): string | null {
    return this.activeClip?.name ?? null;
  }

  public get currentFrameIndex(): number {
    return this.frameIndex;
  }

  public get currentFlipX(): boolean {
    return this.flipX;
  }

  public get isRunning(): boolean {
    return this.running;
  }

  public registerAnimation(
    name: string,
    framePaths: readonly string[],
    options: AnimationRegistrationOptions = {},
  ): AnimationClip {
    return this.registry.register(name, framePaths, options);
  }

  public registerAnimationFromFolder(
    name: string,
    folderPath: string,
    frameModules: AnimationFrameModules,
    options: AnimationRegistrationOptions = {},
  ): AnimationClip {
    return this.registry.registerFromFolder(
      name,
      folderPath,
      frameModules,
      options,
    );
  }

  public unregisterAnimation(name: string): boolean {
    if (this.activeClip?.name === name) {
      this.stop();
      this.activeClip = null;
      this.frameIndex = 0;
      this.flipX = false;
    }

    return this.registry.unregister(name);
  }

  public play(name: string, options: PlayAnimationOptions = {}): void {
    const clip = this.registry.require(name);
    const flipX = options.flipX ?? false;

    if (
      this.running &&
      this.activeClip?.name === clip.name &&
      this.flipX === flipX &&
      options.restart !== true
    ) {
      return;
    }

    const wasRunning = this.running;
    this.running = true;
    this.activateClip(clip, flipX);

    if (!wasRunning) {
      this.scheduleUpdate();
    }
  }

  public start(): void {
    if (this.running || this.activeClip === null) {
      return;
    }

    this.running = true;
    this.previousTimestamp = null;
    this.elapsedTime = 0;
    this.emitCurrentFrame();
    this.scheduleUpdate();
  }

  public stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.animationFrameId = null;
    this.previousTimestamp = null;
    this.elapsedTime = 0;
    this.running = false;
  }

  public reset(): void {
    this.stop();
    this.frameIndex = 0;
    this.emitCurrentFrame();
  }

  private readonly update = (timestamp: number): void => {
    this.animationFrameId = null;

    if (!this.running || this.activeClip === null) {
      return;
    }

    if (this.previousTimestamp === null) {
      this.previousTimestamp = timestamp;
    } else {
      this.elapsedTime += timestamp - this.previousTimestamp;
      this.previousTimestamp = timestamp;

      const frameDuration = 1_000 / this.activeClip.fps;
      const elapsedFrames = Math.floor(this.elapsedTime / frameDuration);

      if (elapsedFrames > 0) {
        this.elapsedTime -= elapsedFrames * frameDuration;
        this.advance(elapsedFrames);
      }
    }

    if (this.running) {
      this.scheduleUpdate();
    }
  };

  private advance(elapsedFrames: number): void {
    const clip = this.activeClip;

    if (clip === null) {
      return;
    }

    const lastFrameIndex = clip.frames.length - 1;

    if (clip.loop) {
      this.frameIndex = (this.frameIndex + elapsedFrames) % clip.frames.length;
      this.emitCurrentFrame();
      return;
    }

    if (this.frameIndex === lastFrameIndex) {
      this.completeAnimation(clip);
      return;
    }

    const nextFrameIndex = this.frameIndex + elapsedFrames;
    this.frameIndex = Math.min(nextFrameIndex, lastFrameIndex);
    this.emitCurrentFrame();

    if (nextFrameIndex > lastFrameIndex) {
      this.completeAnimation(clip);
    }
  }

  private completeAnimation(completedClip: AnimationClip): void {
    this.onAnimationComplete?.(completedClip.name);

    const fallbackClip =
      this.fallbackAnimationName === undefined ||
      this.fallbackAnimationName === completedClip.name
        ? undefined
        : this.registry.get(this.fallbackAnimationName);

    if (fallbackClip !== undefined) {
      this.activateClip(fallbackClip, false);
      return;
    }

    this.running = false;
    this.previousTimestamp = null;
    this.elapsedTime = 0;
  }

  private activateClip(clip: AnimationClip, flipX: boolean): void {
    const animationChanged = this.activeClip?.name !== clip.name;
    this.activeClip = clip;
    this.frameIndex = 0;
    this.flipX = flipX;
    this.previousTimestamp = null;
    this.elapsedTime = 0;

    if (animationChanged) {
      this.onAnimationChange?.(clip.name);
    }

    this.emitCurrentFrame();
  }

  private emitCurrentFrame(): void {
    const clip = this.activeClip;
    const framePath = clip?.frames[this.frameIndex];

    if (clip !== null && framePath !== undefined) {
      this.onFrameChange?.(
        framePath,
        this.frameIndex,
        clip.name,
        this.flipX ? FLIPPED_PRESENTATION : DEFAULT_PRESENTATION,
      );
    }
  }

  private scheduleUpdate(): void {
    if (this.animationFrameId === null) {
      this.animationFrameId = requestAnimationFrame(this.update);
    }
  }
}
