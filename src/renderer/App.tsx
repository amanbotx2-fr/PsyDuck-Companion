import { useCallback, useEffect, useRef } from 'react';

import {
  BEHAVIOR_IDS,
  BehaviorEngine,
  type BehaviorId,
} from '../engine/BehaviorEngine';
import {
  PsyDuck,
  type PsyDuckAnimationController,
} from './components/PsyDuck';

const PLACEHOLDER_BEHAVIORS: readonly BehaviorId[] = [
  BEHAVIOR_IDS.think,
  BEHAVIOR_IDS.sleep,
  BEHAVIOR_IDS.wave,
];

const LOOK_BEHAVIOR_PRIORITY = 200;
const BLINK_BEHAVIOR_PRIORITY = 100;
const MINIMUM_BLINK_INTERVAL_MS = 4_000;
const MAXIMUM_BLINK_INTERVAL_MS = 8_000;

export function App() {
  const animationControllerRef = useRef<PsyDuckAnimationController | null>(
    null,
  );

  const handleAnimationControllerChange = useCallback(
    (controller: PsyDuckAnimationController | null) => {
      animationControllerRef.current = controller;
    },
    [],
  );

  useEffect(() => {
    const lookBehaviorEngine = new BehaviorEngine<BehaviorId>({
      idleBehavior: BEHAVIOR_IDS.idle,
    });
    const blinkBehaviorEngine = new BehaviorEngine<BehaviorId>({
      idleBehavior: BEHAVIOR_IDS.idle,
      minimumIdleIntervalMs: MINIMUM_BLINK_INTERVAL_MS,
      maximumIdleIntervalMs: MAXIMUM_BLINK_INTERVAL_MS,
    });

    lookBehaviorEngine.registerBehavior({
      id: BEHAVIOR_IDS.idle,
      execute: () => undefined,
    });

    lookBehaviorEngine.registerBehavior({
      id: BEHAVIOR_IDS.lookLeft,
      canRun: () =>
        animationControllerRef.current?.hasAnimation(
          BEHAVIOR_IDS.lookLeft,
        ) ?? false,
      execute: () =>
        animationControllerRef.current?.playAnimation(
          BEHAVIOR_IDS.lookLeft,
          { priority: LOOK_BEHAVIOR_PRIORITY, restart: true },
        ),
    });

    lookBehaviorEngine.registerBehavior({
      id: BEHAVIOR_IDS.lookRight,
      canRun: () =>
        animationControllerRef.current?.hasAnimation(
          BEHAVIOR_IDS.lookLeft,
        ) ?? false,
      execute: () =>
        animationControllerRef.current?.playAnimation(
          BEHAVIOR_IDS.lookLeft,
          {
            flipX: true,
            priority: LOOK_BEHAVIOR_PRIORITY,
            restart: true,
          },
        ),
    });

    blinkBehaviorEngine.registerBehavior({
      id: BEHAVIOR_IDS.idle,
      execute: () => undefined,
    });

    blinkBehaviorEngine.registerBehavior({
      id: BEHAVIOR_IDS.blink,
      canRun: () =>
        animationControllerRef.current?.hasAnimation(BEHAVIOR_IDS.blink) ??
        false,
      execute: () =>
        animationControllerRef.current?.playAnimation(BEHAVIOR_IDS.blink, {
          priority: BLINK_BEHAVIOR_PRIORITY,
          restart: true,
        }),
    });

    for (const behaviorId of PLACEHOLDER_BEHAVIORS) {
      lookBehaviorEngine.registerBehavior({
        id: behaviorId,
        canRun: () => false,
        execute: () => undefined,
      });
    }

    lookBehaviorEngine.start();
    blinkBehaviorEngine.start();

    return () => {
      blinkBehaviorEngine.stop();
      lookBehaviorEngine.stop();
    };
  }, []);

  return (
    <main className="app-shell" aria-label="PsyDuck desktop companion">
      <PsyDuck
        onAnimationControllerChange={handleAnimationControllerChange}
      />
    </main>
  );
}
