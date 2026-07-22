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
  BEHAVIOR_IDS.blink,
  BEHAVIOR_IDS.think,
  BEHAVIOR_IDS.sleep,
  BEHAVIOR_IDS.wave,
];

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
    const behaviorEngine = new BehaviorEngine<BehaviorId>({
      idleBehavior: BEHAVIOR_IDS.idle,
    });

    behaviorEngine.registerBehavior({
      id: BEHAVIOR_IDS.idle,
      execute: () => undefined,
    });

    behaviorEngine.registerBehavior({
      id: BEHAVIOR_IDS.lookLeft,
      canRun: () =>
        animationControllerRef.current?.hasAnimation(
          BEHAVIOR_IDS.lookLeft,
        ) ?? false,
      execute: () =>
        animationControllerRef.current?.playAnimation(
          BEHAVIOR_IDS.lookLeft,
          { restart: true },
        ),
    });

    behaviorEngine.registerBehavior({
      id: BEHAVIOR_IDS.lookRight,
      canRun: () =>
        animationControllerRef.current?.hasAnimation(
          BEHAVIOR_IDS.lookLeft,
        ) ?? false,
      execute: () =>
        animationControllerRef.current?.playAnimation(
          BEHAVIOR_IDS.lookLeft,
          { flipX: true, restart: true },
        ),
    });

    for (const behaviorId of PLACEHOLDER_BEHAVIORS) {
      behaviorEngine.registerBehavior({
        id: behaviorId,
        canRun: () => false,
        execute: () => undefined,
      });
    }

    behaviorEngine.start();

    return () => {
      behaviorEngine.stop();
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
