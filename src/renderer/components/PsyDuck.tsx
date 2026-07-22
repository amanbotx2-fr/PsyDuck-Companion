import { useEffect, useRef, useState } from 'react';

import idleFrame001 from '../../../character/animations/idle/idle_001.png';
import idleFrame002 from '../../../character/animations/idle/idle_002.png';
import idleFrame003 from '../../../character/animations/idle/idle_003.png';
import idleFrame004 from '../../../character/animations/idle/idle_004.png';
import idleFrame005 from '../../../character/animations/idle/idle_005.png';
import idleFrame006 from '../../../character/animations/idle/idle_006.png';
import { AnimationEngine } from '../../engine/AnimationEngine';
import { DragController } from '../../engine/DragController';
import { EyeTracker } from '../../engine/EyeTracker';

const IDLE_FRAMES = [
  idleFrame001,
  idleFrame002,
  idleFrame003,
  idleFrame004,
  idleFrame005,
  idleFrame006,
] as const;

const IDLE_FPS = 8;
const CLOSED_EYES_FRAME_INDEX = 3;
const PUPIL_MAX_X = 4;
const PUPIL_MAX_Y = 3;
const EYE_ORIGIN_X = 100;
const EYE_ORIGIN_Y = 84;

const preloadFrame = (framePath: string): Promise<void> =>
  new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = framePath;
  });

export function PsyDuck() {
  const [currentFrame, setCurrentFrame] = useState({
    path: IDLE_FRAMES[0],
    index: 0,
  });
  const stageRef = useRef<HTMLDivElement>(null);
  const eyesRef = useRef<HTMLDivElement>(null);
  const eyeTrackerRef = useRef<EyeTracker | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let disposed = false;
    const animation = new AnimationEngine(IDLE_FRAMES, {
      fps: IDLE_FPS,
      loop: true,
      onFrameChange: (framePath, frameIndex) => {
        setCurrentFrame({ path: framePath, index: frameIndex });
      },
    });

    void Promise.all(IDLE_FRAMES.map(preloadFrame)).then(() => {
      if (!disposed) {
        animation.start();
      }
    });

    return () => {
      disposed = true;
      animation.stop();
    };
  }, []);

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
        setDragging(isDragging);

        if (isDragging) {
          eyeTrackerRef.current?.stop();
        } else {
          eyeTrackerRef.current?.start();
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
        hidden={currentFrame.index === CLOSED_EYES_FRAME_INDEX}
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
