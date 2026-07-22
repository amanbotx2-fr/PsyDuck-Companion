import type { ScreenPoint } from '../shared/types';

export interface NormalizedEyeOffset {
  readonly x: number;
  readonly y: number;
}

export interface CursorPositionSource {
  readonly getCurrentPosition: () => Promise<ScreenPoint>;
  readonly subscribe: (listener: (position: ScreenPoint) => void) => () => void;
}

export interface EyeTrackerOptions {
  readonly cursorSource: CursorPositionSource;
  readonly getEyeOrigin: () => ScreenPoint;
  readonly onOffsetChange: (offset: NormalizedEyeOffset) => void;
  readonly normalizationDistance?: number;
  readonly smoothing?: number;
}

const DEFAULT_NORMALIZATION_DISTANCE = 320;
const DEFAULT_SMOOTHING = 0.18;
const FRAME_DURATION_AT_60_FPS = 1_000 / 60;
const SETTLED_THRESHOLD = 0.001;

export class EyeTracker {
  private readonly cursorSource: CursorPositionSource;
  private readonly getEyeOrigin: () => ScreenPoint;
  private readonly onOffsetChange: (offset: NormalizedEyeOffset) => void;
  private readonly normalizationDistance: number;
  private readonly smoothing: number;
  private currentOffset: NormalizedEyeOffset = { x: 0, y: 0 };
  private targetOffset: NormalizedEyeOffset = { x: 0, y: 0 };
  private animationFrameId: number | null = null;
  private previousTimestamp: number | null = null;
  private unsubscribeFromCursor: (() => void) | null = null;
  private cursorRevision = 0;
  private running = false;

  public constructor(options: EyeTrackerOptions) {
    const normalizationDistance =
      options.normalizationDistance ?? DEFAULT_NORMALIZATION_DISTANCE;
    const smoothing = options.smoothing ?? DEFAULT_SMOOTHING;

    if (!Number.isFinite(normalizationDistance) || normalizationDistance <= 0) {
      throw new RangeError('Eye tracking distance must be greater than zero.');
    }

    if (!Number.isFinite(smoothing) || smoothing <= 0 || smoothing > 1) {
      throw new RangeError('Eye tracking smoothing must be greater than zero and at most one.');
    }

    this.cursorSource = options.cursorSource;
    this.getEyeOrigin = options.getEyeOrigin;
    this.onOffsetChange = options.onOffsetChange;
    this.normalizationDistance = normalizationDistance;
    this.smoothing = smoothing;
  }

  public get normalizedOffset(): NormalizedEyeOffset {
    return { ...this.currentOffset };
  }

  public start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.unsubscribeFromCursor = this.cursorSource.subscribe(
      this.handleCursorPosition,
    );

    const revisionAtRequest = this.cursorRevision;

    void this.cursorSource.getCurrentPosition().then((position) => {
      if (this.running && this.cursorRevision === revisionAtRequest) {
        this.handleCursorPosition(position);
      }
    });
  }

  public stop(): void {
    this.running = false;
    this.cursorRevision += 1;
    this.unsubscribeFromCursor?.();
    this.unsubscribeFromCursor = null;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.animationFrameId = null;
    this.previousTimestamp = null;
  }

  private readonly handleCursorPosition = (position: ScreenPoint): void => {
    if (!this.running) {
      return;
    }

    this.cursorRevision += 1;
    const origin = this.getEyeOrigin();
    const relativeX = (position.x - origin.x) / this.normalizationDistance;
    const relativeY = (position.y - origin.y) / this.normalizationDistance;
    const magnitude = Math.hypot(relativeX, relativeY);
    const clampScale = magnitude > 1 ? 1 / magnitude : 1;

    this.targetOffset = {
      x: relativeX * clampScale,
      y: relativeY * clampScale,
    };

    this.scheduleUpdate();
  };

  private scheduleUpdate(): void {
    if (this.animationFrameId === null) {
      this.animationFrameId = requestAnimationFrame(this.update);
    }
  }

  private readonly update = (timestamp: number): void => {
    this.animationFrameId = null;

    if (!this.running) {
      return;
    }

    const elapsedTime =
      this.previousTimestamp === null
        ? FRAME_DURATION_AT_60_FPS
        : Math.max(timestamp - this.previousTimestamp, 0);
    this.previousTimestamp = timestamp;

    const frameRatio = elapsedTime / FRAME_DURATION_AT_60_FPS;
    const interpolation = 1 - Math.pow(1 - this.smoothing, frameRatio);
    const nextX =
      this.currentOffset.x +
      (this.targetOffset.x - this.currentOffset.x) * interpolation;
    const nextY =
      this.currentOffset.y +
      (this.targetOffset.y - this.currentOffset.y) * interpolation;
    const remainingDistance = Math.hypot(
      this.targetOffset.x - nextX,
      this.targetOffset.y - nextY,
    );

    if (remainingDistance <= SETTLED_THRESHOLD) {
      this.currentOffset = this.targetOffset;
      this.previousTimestamp = null;
    } else {
      this.currentOffset = { x: nextX, y: nextY };
    }

    this.onOffsetChange(this.normalizedOffset);

    if (remainingDistance > SETTLED_THRESHOLD) {
      this.scheduleUpdate();
    }
  };
}
