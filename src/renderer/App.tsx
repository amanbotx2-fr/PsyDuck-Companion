import { useEffect } from 'react';

import {
  BEHAVIOR_IDS,
  BehaviorEngine,
  type BehaviorId,
} from '../engine/BehaviorEngine';
import { PsyDuck } from './components/PsyDuck';

const PLACEHOLDER_BEHAVIORS: readonly BehaviorId[] = [
  BEHAVIOR_IDS.lookLeft,
  BEHAVIOR_IDS.lookRight,
  BEHAVIOR_IDS.blink,
  BEHAVIOR_IDS.think,
  BEHAVIOR_IDS.sleep,
  BEHAVIOR_IDS.wave,
];

export function App() {
  useEffect(() => {
    const behaviorEngine = new BehaviorEngine<BehaviorId>({
      idleBehavior: BEHAVIOR_IDS.idle,
    });

    behaviorEngine.registerBehavior({
      id: BEHAVIOR_IDS.idle,
      execute: () => undefined,
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
      <PsyDuck />
    </main>
  );
}
