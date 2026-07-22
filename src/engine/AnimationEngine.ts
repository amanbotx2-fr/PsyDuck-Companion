export type AnimationFrameListener = (
  framePath: string,
  frameIndex: number,
) => void;

export interface AnimationEngineOptions {
  readonly fps?: number;
  readonly loop?: boolean;
  readonly onFrameChange?: AnimationFrameListener;
}

const DEFAULT_FPS = 12;

export class AnimationEngine {
  private readonly frameDuration: number;
  private readonly loop: boolean;
  private readonly onFrameChange: AnimationFrameListener | undefined;
  private framePaths: readonly string[];
  private frameIndex = 0;
  private animationFrameId: number | null = null;
  private previousTimestamp: number | null = null;
  private elapsedTime = 0;
  private running = false;

  public constructor(
    framePaths: readonly string[],
    options: AnimationEngineOptions = {},
  ) {
    const fps = options.fps ?? DEFAULT_FPS;

    if (!Number.isFinite(fps) || fps <= 0) {
      throw new RangeError('Animation FPS must be a finite number greater than zero.');
    }

    this.frameDuration = 1_000 / fps;
    this.loop = options.loop ?? true;
    this.onFrameChange = options.onFrameChange;
    this.framePaths = this.validateAndCopyFrames(framePaths);
  }

  public get currentFrameIndex(): number {
    return this.frameIndex;
  }

  public start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.previousTimestamp = null;
    this.elapsedTime = 0;
    this.emitCurrentFrame();
    this.animationFrameId = requestAnimationFrame(this.update);
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
    if (!this.running) {
      return;
    }

    if (this.previousTimestamp === null) {
      this.previousTimestamp = timestamp;
    } else {
      this.elapsedTime += timestamp - this.previousTimestamp;
      this.previousTimestamp = timestamp;

      const elapsedFrames = Math.floor(this.elapsedTime / this.frameDuration);

      if (elapsedFrames > 0) {
        this.elapsedTime -= elapsedFrames * this.frameDuration;
        this.advance(elapsedFrames);
      }
    }

    if (this.running) {
      this.animationFrameId = requestAnimationFrame(this.update);
    }
  };

  private advance(elapsedFrames: number): void {
    const lastFrameIndex = this.framePaths.length - 1;

    if (this.loop) {
      this.frameIndex = (this.frameIndex + elapsedFrames) % this.framePaths.length;
      this.emitCurrentFrame();
      return;
    }

    this.frameIndex = Math.min(this.frameIndex + elapsedFrames, lastFrameIndex);
    this.emitCurrentFrame();

    if (this.frameIndex === lastFrameIndex) {
      this.stop();
    }
  }

  private emitCurrentFrame(): void {
    const framePath = this.framePaths[this.frameIndex];

    if (framePath !== undefined) {
      this.onFrameChange?.(framePath, this.frameIndex);
    }
  }

  private validateAndCopyFrames(framePaths: readonly string[]): readonly string[] {
    if (framePaths.length === 0) {
      throw new RangeError('An animation must contain at least one frame.');
    }

    if (framePaths.some((framePath) => framePath.trim().length === 0)) {
      throw new TypeError('Animation frame paths must be non-empty strings.');
    }

    return [...framePaths];
  }
}
