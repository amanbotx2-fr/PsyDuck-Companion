import { useCallback, useEffect, useRef } from 'react';

import {
  BEHAVIOR_IDS,
  BehaviorEngine,
  type BehaviorId,
} from '../engine/BehaviorEngine';
import { WaterReminder } from '../engine/WaterReminder';
import {
  PsyDuck,
  type PsyDuckAnimationController,
} from './components/PsyDuck';
import { SpeechBubble } from './components/SpeechBubble';
import { useSettings } from './hooks/useSettings';
import { useSpeechBubble } from './hooks/useSpeechBubble';

const PLACEHOLDER_BEHAVIORS: readonly BehaviorId[] = [
  BEHAVIOR_IDS.think,
  BEHAVIOR_IDS.sleep,
  BEHAVIOR_IDS.wave,
];

const LOOK_BEHAVIOR_PRIORITY = 200;
const BLINK_BEHAVIOR_PRIORITY = 100;
const MINIMUM_BLINK_INTERVAL_MS = 4_000;
const MAXIMUM_BLINK_INTERVAL_MS = 8_000;
const WATER_REMINDER_DEVELOPMENT_INTERVAL_MS = 60_000;
const SETTINGS_MANAGED_REMINDER_STORAGE = {
  getItem: () => null,
  setItem: () => undefined,
};

export function App() {
  const animationControllerRef = useRef<PsyDuckAnimationController | null>(
    null,
  );
  const waterReminderRef = useRef<WaterReminder | null>(null);
  const { settings } = useSettings();
  const speechBubble = useSpeechBubble();

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

  useEffect(() => {
    const waterReminder = new WaterReminder({
      showMessage: speechBubble.show,
      storage: SETTINGS_MANAGED_REMINDER_STORAGE,
      ...(import.meta.env.DEV
        ? { intervalOverrideMs: WATER_REMINDER_DEVELOPMENT_INTERVAL_MS }
        : {}),
    });

    waterReminderRef.current = waterReminder;
    waterReminder.start();

    return () => {
      waterReminder.stop();

      if (waterReminderRef.current === waterReminder) {
        waterReminderRef.current = null;
      }
    };
  }, [speechBubble.show]);

  useEffect(() => {
    const waterReminder = waterReminderRef.current;

    if (waterReminder === null) {
      return;
    }

    waterReminder.setInterval(settings.water.interval);

    if (settings.water.enabled) {
      waterReminder.enable();
    } else {
      waterReminder.disable();
    }
  }, [settings.water.enabled, settings.water.interval]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    const previousShow = window.show;
    const previousHide = window.hide;
    const previousClearQueue = window.clearQueue;

    window.show = speechBubble.show;
    window.hide = speechBubble.hide;
    window.clearQueue = speechBubble.clearQueue;

    return () => {
      if (window.show === speechBubble.show) {
        if (previousShow === undefined) {
          delete window.show;
        } else {
          window.show = previousShow;
        }
      }

      if (window.hide === speechBubble.hide) {
        if (previousHide === undefined) {
          delete window.hide;
        } else {
          window.hide = previousHide;
        }
      }

      if (window.clearQueue === speechBubble.clearQueue) {
        if (previousClearQueue === undefined) {
          delete window.clearQueue;
        } else {
          window.clearQueue = previousClearQueue;
        }
      }
    };
  }, [speechBubble.clearQueue, speechBubble.hide, speechBubble.show]);

  return (
    <main className="app-shell" aria-label="PsyDuck desktop companion">
      <SpeechBubble
        message={speechBubble.currentMessage}
        visibility={speechBubble.visibility}
        onExitTransitionEnd={speechBubble.notifyExitTransitionEnd}
      />
      <PsyDuck
        eyeTrackingEnabled={settings.general.eyeTracking}
        onAnimationControllerChange={handleAnimationControllerChange}
      />
    </main>
  );
}
