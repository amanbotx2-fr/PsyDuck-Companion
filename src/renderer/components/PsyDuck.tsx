import { useEffect, useRef, useState } from 'react';

import {
  AnimationEngine,
  type PlayAnimationOptions,
} from '../../engine/AnimationEngine';
import {
  AnimationRegistry,
  type AnimationFrameModules,
} from '../../engine/AnimationRegistry';
import { DragController } from '../../engine/DragController';
import { EyeTracker } from '../../engine/EyeTracker';

const ANIMATION_ROOT = '../../../character/animations';
const IDLE_ANIMATION_NAME = 'idle';
const LOOK_LEFT_ANIMATION_NAME = 'look_left';
const BLINK_ANIMATION_NAME = 'blink';
const IDLE_FPS = 8;
const PUPIL_MAX_X = 4;
const PUPIL_MAX_Y = 3;
const EYE_ORIGIN_X = 100;
const EYE_ORIGIN_Y = 84;
const ANIMATION_LOOP_OPTIONS: Readonly<Record<string, boolean>> = {
  [IDLE_ANIMATION_NAME]: true,
  [BLINK_ANIMATION_NAME]: false,
};

const animationFrameModules = import.meta.glob(
  '../../../character/animations/*/*.{png,webp}',
  { eager: true, import: 'default', query: '?url' },
) as AnimationFrameModules;

const animationRegistry = new AnimationRegistry();
animationRegistry.registerFolders(ANIMATION_ROOT, animationFrameModules, {
  fps: IDLE_FPS,
  loop: false,
  getAnimationOptions: (animationName) => {
    const loop = ANIMATION_LOOP_OPTIONS[animationName];
    return loop === undefined ? undefined : { loop };
  },
});

const idleAnimation = animationRegistry.require(IDLE_ANIMATION_NAME);
const lookLeftAnimation = animationRegistry.require(LOOK_LEFT_ANIMATION_NAME);
const blinkAnimation = animationRegistry.require(BLINK_ANIMATION_NAME);

const preloadFrame = (framePath: string): Promise<void> =>
  new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = framePath;
  });

export interface PsyDuckAnimationController {
  readonly hasAnimation: (animationName: string) => boolean;
  readonly playAnimation: (
    animationName: string,
    options?: QueuedAnimationOptions,
  ) => Promise<void>;
}

export interface QueuedAnimationOptions extends PlayAnimationOptions {
  readonly priority?: number;
}

export interface PsyDuckProps {
  readonly onAnimationControllerChange?: (
    controller: PsyDuckAnimationController | null,
  ) => void;
}

interface QueuedPlayback {
  readonly animationName: string;
  readonly options: PlayAnimationOptions;
  readonly priority: number;
  readonly sequence: number;
  readonly resolve: () => void;
  readonly reject: (reason: unknown) => void;
}

const animationFramesToPreload = [
  ...new Set([
    ...idleAnimation.frames,
    ...lookLeftAnimation.frames,
    ...blinkAnimation.frames,
  ]),
];

export function PsyDuck({ onAnimationControllerChange }: PsyDuckProps) {
  const [currentFrame, setCurrentFrame] = useState({
    path: idleAnimation.frames[0],
    index: 0,
    animationName: IDLE_ANIMATION_NAME,
    flipX: false,
  });
  const stageRef = useRef<HTMLDivElement>(null);
  const eyesRef = useRef<HTMLDivElement>(null);
  const eyeTrackerRef = useRef<EyeTracker | null>(null);
  const draggingRef = useRef(false);
  const resumeQueuedPlaybackRef = useRef<(() => void) | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let disposed = false;
    let playbackSequence = 0;
    let activePlayback: QueuedPlayback | null = null;
    const playbackQueue: QueuedPlayback[] = [];

    const animation = new AnimationEngine({
      registry: animationRegistry,
      fallbackAnimationName: IDLE_ANIMATION_NAME,
      onFrameChange: (
        framePath,
        frameIndex,
        animationName,
        presentation,
      ) => {
        setCurrentFrame({
          path: framePath,
          index: frameIndex,
          animationName,
          flipX: presentation.flipX,
        });
      },
      onAnimationComplete: (animationName) => {
        if (activePlayback?.animationName !== animationName) {
          return;
        }

        const completedPlayback = activePlayback;
        activePlayback = null;
        completedPlayback.resolve();
        requestAnimationFrame(runNextPlayback);
      },
    });

    const runNextPlayback = (): void => {
      if (
        disposed ||
        draggingRef.current ||
        activePlayback !== null ||
        playbackQueue.length === 0
      ) {
        return;
      }

      playbackQueue.sort(
        (left, right) =>
          right.priority - left.priority || left.sequence - right.sequence,
      );

      const nextPlayback = playbackQueue.shift();

      if (nextPlayback === undefined) {
        return;
      }

      activePlayback = nextPlayback;

      try {
        const clip = animationRegistry.require(nextPlayback.animationName);
        animation.play(nextPlayback.animationName, nextPlayback.options);

        if (clip.loop) {
          activePlayback = null;
          nextPlayback.resolve();
          requestAnimationFrame(runNextPlayback);
        }
      } catch (error) {
        activePlayback = null;
        nextPlayback.reject(error);
        queueMicrotask(runNextPlayback);
      }
    };

    const settlePlaybackRequests = (): void => {
      activePlayback?.resolve();
      activePlayback = null;

      for (const playback of playbackQueue.splice(0)) {
        playback.resolve();
      }
    };

    const controller: PsyDuckAnimationController = {
      hasAnimation: (animationName) => animationRegistry.has(animationName),
      playAnimation: (animationName, options = {}) => {
        animationRegistry.require(animationName);

        const { priority = 0, ...playOptions } = options;

        return new Promise<void>((resolve, reject) => {
          playbackQueue.push({
            animationName,
            options: playOptions,
            priority,
            sequence: playbackSequence,
            resolve,
            reject,
          });
          playbackSequence += 1;
          runNextPlayback();
        });
      },
    };

    resumeQueuedPlaybackRef.current = runNextPlayback;

    void Promise.all(animationFramesToPreload.map(preloadFrame)).then(() => {
      if (!disposed) {
        animation.play(IDLE_ANIMATION_NAME);
        onAnimationControllerChange?.(controller);
      }
    });

    return () => {
      disposed = true;
      onAnimationControllerChange?.(null);
      resumeQueuedPlaybackRef.current = null;
      animation.stop();
      settlePlaybackRequests();
    };
  }, [onAnimationControllerChange]);

  useEffect(() => {
    const desktopBridge = window.psyduck;

    if (desktopBridge === undefined) {
      return;
    }

    const tracker = new EyeTracker({
      cursorSource: {
        getCurrentPosition: desktopBridge.getCursorPosition,
        subscribe: desktopBridge.onCursorPosition,
      },
      getEyeOrigin: () => {
        const stageBounds = stageRef.current?.getBoundingClientRect();

        return {
          x: window.screenX + (stageBounds?.left ?? 0) + EYE_ORIGIN_X,
          y: window.screenY + (stageBounds?.top ?? 0) + EYE_ORIGIN_Y,
        };
      },
      onOffsetChange: (offset) => {
        eyesRef.current?.style.setProperty(
          '--pupil-x',
          `${(offset.x * PUPIL_MAX_X).toFixed(2)}px`,
        );
        eyesRef.current?.style.setProperty(
          '--pupil-y',
          `${(offset.y * PUPIL_MAX_Y).toFixed(2)}px`,
        );
      },
    });

    eyeTrackerRef.current = tracker;
    tracker.start();

    return () => {
      tracker.stop();

      if (eyeTrackerRef.current === tracker) {
        eyeTrackerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const desktopBridge = window.psyduck;
    const stage = stageRef.current;

    if (desktopBridge === undefined || stage === null) {
      return;
    }

    const dragController = new DragController({
      surface: stage,
      getWindowPosition: () => ({ x: window.screenX, y: window.screenY }),
      moveWindow: desktopBridge.moveWindow,
      onDraggingChange: (isDragging) => {
        draggingRef.current = isDragging;
        setDragging(isDragging);

        if (isDragging) {
          eyeTrackerRef.current?.stop();
        } else {
          eyeTrackerRef.current?.start();
          resumeQueuedPlaybackRef.current?.();
        }
      },
    });

    dragController.start();

    return () => {
      dragController.stop();
    };
  }, []);

  return (
    <div
      ref={stageRef}
      className="psyduck-stage"
      data-dragging={dragging}
      data-flip-x={currentFrame.flipX}
    >
      <img
        className="psyduck"
        src={currentFrame.path}
        alt="PsyDuck"
        draggable={false}
      />
      <div
        ref={eyesRef}
        className="psyduck-eyes"
        aria-hidden="true"
        hidden={currentFrame.animationName !== IDLE_ANIMATION_NAME}
      >
        <span className="psyduck-eye psyduck-eye--left">
          <span className="psyduck-pupil">
            <img
              className="psyduck-pupil-source"
              src={currentFrame.path}
              alt=""
              draggable={false}
            />
          </span>
        </span>
        <span className="psyduck-eye psyduck-eye--right">
          <span className="psyduck-pupil">
            <img
              className="psyduck-pupil-source"
              src={currentFrame.path}
              alt=""
              draggable={false}
            />
          </span>
        </span>
      </div>
    </div>
  );
}
