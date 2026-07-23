import { useCallback, useEffect, useRef, useState } from 'react';

import {
  BEHAVIOR_IDS,
  BehaviorEngine,
  type BehaviorId,
} from '../engine/BehaviorEngine';
import { WaterReminder } from '../engine/WaterReminder';
import { personalityService } from '../personality';
import {
  PsyDuck,
  type PsyDuckAnimationController,
} from './components/PsyDuck';
import {
  ChatInputBubble,
  type ChatInputDismissReason,
} from './components/ChatInputBubble';
import { SpeechBubble } from './components/SpeechBubble';
import { useRuntimeSettings } from './hooks/useRuntimeSettings';
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
const MINIMUM_THINKING_DURATION_MS = 350;
const AI_RESPONSE_DURATION_MS = 5_000;
const SETTINGS_MANAGED_REMINDER_STORAGE = {
  getItem: () => null,
  setItem: () => undefined,
};

type AIInteractionState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'input-open' }
  | {
      readonly phase: 'thinking';
      readonly requestId: number;
      readonly startedAt: number;
    }
  | {
      readonly phase: 'showing-response';
      readonly requestId: number;
      readonly messageId: number;
    };

const INITIAL_AI_INTERACTION_STATE: AIInteractionState = {
  phase: 'idle',
};

export function App() {
  const animationControllerRef = useRef<PsyDuckAnimationController | null>(
    null,
  );
  const waterReminderRef = useRef<WaterReminder | null>(null);
  const aiInteractionRef = useRef<AIInteractionState>(
    INITIAL_AI_INTERACTION_STATE,
  );
  const requestSequenceRef = useRef(0);
  const submissionInProgressRef = useRef(false);
  const responseDelayTimerRef = useRef<ReturnType<
    typeof globalThis.setTimeout
  > | null>(null);
  const mountedRef = useRef(true);
  const [aiInteraction, setAIInteraction] = useState<AIInteractionState>(
    INITIAL_AI_INTERACTION_STATE,
  );
  const settings = useRuntimeSettings();
  const speechBubble = useSpeechBubble();

  const transitionAIInteraction = useCallback(
    (nextState: AIInteractionState): void => {
      aiInteractionRef.current = nextState;
      setAIInteraction(nextState);
    },
    [],
  );

  const handleAnimationControllerChange = useCallback(
    (controller: PsyDuckAnimationController | null) => {
      animationControllerRef.current = controller;
    },
    [],
  );

  const showAIResponse = useCallback(
    (requestId: number, responseText: string): void => {
      if (
        !mountedRef.current ||
        aiInteractionRef.current.phase !== 'thinking' ||
        aiInteractionRef.current.requestId !== requestId
      ) {
        return;
      }

      const normalizedResponse = responseText.trim();
      speechBubble.clearQueue();
      speechBubble.hide();
      const messageId = speechBubble.show(
        normalizedResponse.length > 0
          ? normalizedResponse
          : personalityService.getErrorMessage(),
        { duration: AI_RESPONSE_DURATION_MS },
      );

      submissionInProgressRef.current = false;
      transitionAIInteraction({
        phase: 'showing-response',
        requestId,
        messageId,
      });
    },
    [
      speechBubble.clearQueue,
      speechBubble.hide,
      speechBubble.show,
      transitionAIInteraction,
    ],
  );

  const scheduleAIResponse = useCallback(
    (requestId: number, responseText: string, startedAt: number): void => {
      const elapsedTime = performance.now() - startedAt;
      const remainingDelay = Math.max(
        MINIMUM_THINKING_DURATION_MS - elapsedTime,
        0,
      );

      if (responseDelayTimerRef.current !== null) {
        globalThis.clearTimeout(responseDelayTimerRef.current);
      }

      responseDelayTimerRef.current = globalThis.setTimeout(() => {
        responseDelayTimerRef.current = null;
        showAIResponse(requestId, responseText);
      }, remainingDelay);
    },
    [showAIResponse],
  );

  const handlePsyDuckActivate = useCallback((): void => {
    if (aiInteractionRef.current.phase !== 'idle') {
      return;
    }

    submissionInProgressRef.current = false;
    speechBubble.clearQueue();
    speechBubble.hide();
    transitionAIInteraction({ phase: 'input-open' });
  }, [
    speechBubble.clearQueue,
    speechBubble.hide,
    transitionAIInteraction,
  ]);

  const handleChatInputCancel = useCallback(
    (_reason: ChatInputDismissReason): void => {
      if (aiInteractionRef.current.phase !== 'input-open') {
        return;
      }

      submissionInProgressRef.current = false;
      transitionAIInteraction({ phase: 'idle' });
    },
    [transitionAIInteraction],
  );

  const handleChatInputSubmit = useCallback(
    (prompt: string): void => {
      if (
        aiInteractionRef.current.phase !== 'input-open' ||
        submissionInProgressRef.current
      ) {
        return;
      }

      const normalizedPrompt = prompt.trim();

      if (normalizedPrompt.length === 0) {
        return;
      }

      submissionInProgressRef.current = true;
      requestSequenceRef.current += 1;
      const requestId = requestSequenceRef.current;
      const startedAt = performance.now();

      transitionAIInteraction({
        phase: 'thinking',
        requestId,
        startedAt,
      });
      speechBubble.clearQueue();
      speechBubble.hide();
      speechBubble.show(personalityService.getThinkingMessage(), {
        icon: '🤔',
        persistent: true,
      });

      const request = window.psyduck?.askAI(normalizedPrompt);

      if (request === undefined) {
        scheduleAIResponse(
          requestId,
          personalityService.getAIUnavailableMessage(),
          startedAt,
        );
        return;
      }

      void request.then(
        (result) => {
          scheduleAIResponse(
            requestId,
            result.ok ? result.response.content : result.message,
            startedAt,
          );
        },
        () => {
          scheduleAIResponse(
            requestId,
            personalityService.getAIUnavailableMessage(),
            startedAt,
          );
        },
      );
    },
    [
      scheduleAIResponse,
      speechBubble.clearQueue,
      speechBubble.hide,
      speechBubble.show,
      transitionAIInteraction,
    ],
  );

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      if (responseDelayTimerRef.current !== null) {
        globalThis.clearTimeout(responseDelayTimerRef.current);
        responseDelayTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (
      aiInteraction.phase !== 'showing-response' ||
      speechBubble.currentMessage?.id !== aiInteraction.messageId
    ) {
      return;
    }

    if (speechBubble.visibility === 'exiting') {
      transitionAIInteraction({ phase: 'idle' });
    }
  }, [
    aiInteraction,
    speechBubble.currentMessage,
    speechBubble.visibility,
    transitionAIInteraction,
  ]);

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
      debug: import.meta.env.DEV,
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
    <main
      className="app-shell"
      data-ai-state={aiInteraction.phase}
      aria-label="PsyDuck desktop companion"
    >
      {aiInteraction.phase === 'input-open' ? null : (
        <SpeechBubble
          message={speechBubble.currentMessage}
          visibility={speechBubble.visibility}
          onExitTransitionEnd={speechBubble.notifyExitTransitionEnd}
        />
      )}
      <ChatInputBubble
        open={aiInteraction.phase === 'input-open'}
        onCancel={handleChatInputCancel}
        onSubmit={handleChatInputSubmit}
      />
      <PsyDuck
        activationEnabled={aiInteraction.phase === 'idle'}
        eyeTrackingEnabled={settings.general.eyeTracking}
        onActivate={handlePsyDuckActivate}
        onAnimationControllerChange={handleAnimationControllerChange}
      />
    </main>
  );
}
