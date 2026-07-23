import { useCallback, useEffect, useRef, useState } from 'react';

import {
  BEHAVIOR_IDS,
  BehaviorEngine,
  type BehaviorId,
} from '../engine/BehaviorEngine';
import { WaterReminder } from '../engine/WaterReminder';
import {
  PERSONALITY_TRIGGERS,
  personalityService,
} from '../personality';
import type { DailyPlannerBriefing } from '../shared/dailyPlanner';
import {
  createReminderUpdateInput,
  type ReminderManagerView,
} from '../shared/reminderManager';
import type {
  CreateReminderInput,
  Reminder,
} from '../shared/reminders';
import { DEFAULT_USER_NAME } from '../shared/settings';
import {
  PsyDuck,
  type PsyDuckAnimationController,
} from './components/PsyDuck';
import {
  ChatInputBubble,
  type ChatInputDismissReason,
} from './components/ChatInputBubble';
import {
  COMPANION_WIDGET_IDS,
  CompanionWidget,
  CompanionWidgetStack,
} from './components/CompanionWidgetStack';
import {
  DailyPlannerPanel,
  type DailyPlannerPanelDismissReason,
} from './components/DailyPlannerPanel';
import {
  PomodoroDurationPanel,
  type PomodoroDurationPanelDismissReason,
} from './components/PomodoroDurationPanel';
import { PomodoroWidget } from './components/PomodoroWidget';
import {
  ReminderCreationPanel,
  type ReminderCreationPanelDismissReason,
} from './components/ReminderCreationPanel';
import {
  ReminderManagerPanel,
  type ReminderManagerPanelDismissReason,
} from './components/ReminderManagerPanel';
import { ReminderWidget } from './components/ReminderWidget';
import { SpeechBubble } from './components/SpeechBubble';
import {
  StickyMessagePanel,
  type StickyMessagePanelDismissReason,
} from './components/StickyMessagePanel';
import { StickyMessageWidget } from './components/StickyMessageWidget';
import {
  UserNamePanel,
  type UserNamePanelDismissReason,
} from './components/UserNamePanel';
import { usePomodoroState } from './hooks/usePomodoroState';
import { useReminderNotifications } from './hooks/useReminderNotifications';
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
const CHAT_INPUT_CLOSE_TRANSITION_MS = 200;
const AI_RESPONSE_DURATION_MS = 5_000;
const POMODORO_COMPLETION_DURATION_MS = 5_000;
const POMODORO_CELEBRATION_DURATION_MS = 900;
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
  const chatInputCloseTimerRef = useRef<ReturnType<
    typeof globalThis.setTimeout
  > | null>(null);
  const celebrationTimerRef = useRef<ReturnType<
    typeof globalThis.setTimeout
  > | null>(null);
  const pendingPomodoroCompletionRef = useRef<string | null>(null);
  const pomodoroCompletionSequenceRef = useRef(0);
  const waterReminderSequenceRef = useRef(0);
  const stickyMessageSaveSequenceRef = useRef(0);
  const returnToReminderManagerRef = useRef(false);
  const mountedRef = useRef(true);
  const [aiInteraction, setAIInteraction] = useState<AIInteractionState>(
    INITIAL_AI_INTERACTION_STATE,
  );
  const [chatInputPresent, setChatInputPresent] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [customPomodoroPanelOpen, setCustomPomodoroPanelOpen] =
    useState(false);
  const [customPomodoroPanelPresent, setCustomPomodoroPanelPresent] =
    useState(false);
  const [
    customPomodoroPanelRequestSequence,
    setCustomPomodoroPanelRequestSequence,
  ] = useState(0);
  const [userNamePanelOpen, setUserNamePanelOpen] = useState(false);
  const [userNamePanelPresent, setUserNamePanelPresent] =
    useState(false);
  const [userNamePanelRequestSequence, setUserNamePanelRequestSequence] =
    useState(0);
  const [stickyMessagePanelOpen, setStickyMessagePanelOpen] =
    useState(false);
  const [stickyMessagePanelPresent, setStickyMessagePanelPresent] =
    useState(false);
  const [
    stickyMessagePanelRequestSequence,
    setStickyMessagePanelRequestSequence,
  ] = useState(0);
  const [reminderPanelOpen, setReminderPanelOpen] = useState(false);
  const [reminderPanelPresent, setReminderPanelPresent] =
    useState(false);
  const [reminderPanelRequestSequence, setReminderPanelRequestSequence] =
    useState(0);
  const [editingReminder, setEditingReminder] =
    useState<Reminder | null>(null);
  const [reminderManagerOpen, setReminderManagerOpen] =
    useState(false);
  const [reminderManagerPresent, setReminderManagerPresent] =
    useState(false);
  const [
    reminderManagerRequestSequence,
    setReminderManagerRequestSequence,
  ] = useState(0);
  const [reminderManagerView, setReminderManagerView] =
    useState<ReminderManagerView>('upcoming');
  const [dailyPlannerOpen, setDailyPlannerOpen] = useState(false);
  const [dailyPlannerPresent, setDailyPlannerPresent] =
    useState(false);
  const [dailyPlannerRequestSequence, setDailyPlannerRequestSequence] =
    useState(0);
  const pomodoroState = usePomodoroState();
  const settings = useRuntimeSettings();
  const speechBubble = useSpeechBubble();
  const reminderNotifications = useReminderNotifications();

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

  const scheduleChatInputUnmount = useCallback((): void => {
    if (chatInputCloseTimerRef.current !== null) {
      globalThis.clearTimeout(chatInputCloseTimerRef.current);
    }

    chatInputCloseTimerRef.current = globalThis.setTimeout(() => {
      chatInputCloseTimerRef.current = null;

      if (mountedRef.current) {
        setChatInputPresent(false);
      }
    }, CHAT_INPUT_CLOSE_TRANSITION_MS);
  }, []);

  const handlePsyDuckActivate = useCallback((): void => {
    if (aiInteractionRef.current.phase !== 'idle') {
      return;
    }

    if (chatInputCloseTimerRef.current !== null) {
      globalThis.clearTimeout(chatInputCloseTimerRef.current);
      chatInputCloseTimerRef.current = null;
    }

    setChatInputPresent(true);
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
      scheduleChatInputUnmount();
    },
    [scheduleChatInputUnmount, transitionAIInteraction],
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
      scheduleChatInputUnmount();
      speechBubble.clearQueue();
      speechBubble.hide();
      speechBubble.show(personalityService.getThinkingMessage(), {
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
      scheduleChatInputUnmount,
      speechBubble.clearQueue,
      speechBubble.hide,
      speechBubble.show,
      transitionAIInteraction,
    ],
  );

  const showPomodoroCompletion = useCallback(
    (sourceEventId: string): void => {
      pendingPomodoroCompletionRef.current = null;
      personalityService.emitPomodoroCompletion(sourceEventId);
    },
    [],
  );

  const handleCustomPomodoroPanelDismiss = useCallback(
    (_reason: PomodoroDurationPanelDismissReason): void => {
      setCustomPomodoroPanelOpen(false);
    },
    [],
  );

  const handleCustomPomodoroStart = useCallback(
    async (durationMinutes: number): Promise<void> => {
      const bridge = window.psyduck;

      if (bridge === undefined) {
        throw new Error('The desktop bridge is unavailable.');
      }

      await bridge.startPomodoro(durationMinutes);
      setCustomPomodoroPanelOpen(false);
    },
    [],
  );

  const handleCustomPomodoroPanelAfterClose = useCallback((): void => {
    setCustomPomodoroPanelPresent(false);
    window.psyduck?.notifyCustomPomodoroPanelClosed();
  }, []);

  const handleUserNamePanelDismiss = useCallback(
    (_reason: UserNamePanelDismissReason): void => {
      setUserNamePanelOpen(false);
    },
    [],
  );

  const handleUserNameSave = useCallback(
    async (name: string): Promise<void> => {
      const bridge = window.psyduck;

      if (bridge === undefined) {
        throw new Error('The desktop bridge is unavailable.');
      }

      const savedName = await bridge.updateUserName(name);
      setUserNamePanelOpen(false);
      speechBubble.show(`Nice to meet you, ${savedName}!`);
    },
    [speechBubble.show],
  );

  const handleUserNamePanelAfterClose = useCallback((): void => {
    setUserNamePanelPresent(false);
  }, []);

  const handleStickyMessagePanelDismiss = useCallback(
    (_reason: StickyMessagePanelDismissReason): void => {
      setStickyMessagePanelOpen(false);
    },
    [],
  );

  const handleStickyMessageSave = useCallback(
    async (message: string): Promise<void> => {
      const bridge = window.psyduck;

      if (bridge === undefined) {
        throw new Error('The desktop bridge is unavailable.');
      }

      await bridge.updateStickyMessage(message);
      setStickyMessagePanelOpen(false);
      stickyMessageSaveSequenceRef.current += 1;
      personalityService.emitStickyMessageSaved(
        `sticky-message-save-${stickyMessageSaveSequenceRef.current}`,
      );
    },
    [],
  );

  const handleStickyMessagePanelAfterClose = useCallback((): void => {
    setStickyMessagePanelPresent(false);
  }, []);

  const openReminderManager = useCallback((): void => {
    setReminderManagerRequestSequence((sequence) => sequence + 1);
    setReminderManagerPresent(true);
    setReminderManagerOpen(true);
  }, []);

  const handleReminderPanelDismiss = useCallback(
    (_reason: ReminderCreationPanelDismissReason): void => {
      setReminderPanelOpen(false);
    },
    [],
  );

  const handleReminderSave = useCallback(
    async (input: CreateReminderInput): Promise<void> => {
      const bridge = window.psyduck;

      if (bridge === undefined) {
        throw new Error('The desktop bridge is unavailable.');
      }

      if (editingReminder !== null) {
        const update = createReminderUpdateInput(
          editingReminder,
          input,
        );

        if (update !== null) {
          await bridge.updateReminder(editingReminder.id, update);
        }

        setReminderPanelOpen(false);
        return;
      }

      await bridge.createReminder(input);
      setReminderPanelOpen(false);
      const userName = settings.userName.trim() || DEFAULT_USER_NAME;
      speechBubble.show(`Got it, ${userName}! I'll remind you.`);
    },
    [editingReminder, settings.userName, speechBubble.show],
  );

  const handleReminderPanelAfterClose = useCallback((): void => {
    setReminderPanelPresent(false);
    setEditingReminder(null);

    if (returnToReminderManagerRef.current) {
      returnToReminderManagerRef.current = false;
      openReminderManager();
    }
  }, [openReminderManager]);

  const handleReminderManagerDismiss = useCallback(
    (_reason: ReminderManagerPanelDismissReason): void => {
      setReminderManagerOpen(false);
    },
    [],
  );

  const handleReminderManagerAfterClose = useCallback((): void => {
    setReminderManagerPresent(false);
  }, []);

  const handleReminderManagerLoad = useCallback(
    async (): Promise<readonly Reminder[]> => {
      const bridge = window.psyduck;

      if (bridge === undefined) {
        throw new Error('The desktop bridge is unavailable.');
      }

      return bridge.listReminders();
    },
    [],
  );

  const handleReminderManagerDelete = useCallback(
    async (id: string): Promise<boolean> => {
      const bridge = window.psyduck;

      if (bridge === undefined) {
        throw new Error('The desktop bridge is unavailable.');
      }

      return bridge.deleteReminder(id);
    },
    [],
  );

  const handleReminderManagerEdit = useCallback(
    (reminder: Reminder): void => {
      returnToReminderManagerRef.current = true;
      setReminderManagerOpen(false);
      setEditingReminder(reminder);
      setReminderPanelRequestSequence((sequence) => sequence + 1);
      setReminderPanelPresent(true);
      setReminderPanelOpen(true);
    },
    [],
  );

  const handleDailyPlannerDismiss = useCallback(
    (_reason: DailyPlannerPanelDismissReason): void => {
      setDailyPlannerOpen(false);
    },
    [],
  );

  const handleDailyPlannerAfterClose = useCallback((): void => {
    setDailyPlannerPresent(false);
  }, []);

  const handleDailyPlannerLoad = useCallback(
    async (): Promise<DailyPlannerBriefing> => {
      const bridge = window.psyduck;

      if (bridge === undefined) {
        throw new Error('The desktop bridge is unavailable.');
      }

      return bridge.getDailyPlanner();
    },
    [],
  );

  const handleContentHeightChange = useCallback((height: number): void => {
    window.psyduck?.setCompanionContentHeight(height);
  }, []);

  const handleReminderDismiss = useCallback((): void => {
    const currentNotification = reminderNotifications.current;

    if (
      currentNotification === null ||
      reminderNotifications.snoozing
    ) {
      return;
    }

    reminderNotifications.dismissCurrent();
    personalityService.emitReminderCompletion(
      currentNotification.reminder.id,
    );
  }, [
    reminderNotifications.current,
    reminderNotifications.dismissCurrent,
    reminderNotifications.snoozing,
  ]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      if (responseDelayTimerRef.current !== null) {
        globalThis.clearTimeout(responseDelayTimerRef.current);
        responseDelayTimerRef.current = null;
      }

      if (chatInputCloseTimerRef.current !== null) {
        globalThis.clearTimeout(chatInputCloseTimerRef.current);
        chatInputCloseTimerRef.current = null;
      }

      if (celebrationTimerRef.current !== null) {
        globalThis.clearTimeout(celebrationTimerRef.current);
        celebrationTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const unsubscribe = personalityService.subscribe((event) => {
      if (event.trigger === PERSONALITY_TRIGGERS.pomodoroCompleted) {
        speechBubble.show(event.message, {
          duration: POMODORO_COMPLETION_DURATION_MS,
        });
        return;
      }

      speechBubble.show(event.message);
    });

    personalityService.emitStartupGreeting();

    return unsubscribe;
  }, [speechBubble.show]);

  useEffect(() => {
    const bridge = window.psyduck;

    if (bridge === undefined) {
      return;
    }

    return bridge.onPomodoroCompleted(() => {
      pomodoroCompletionSequenceRef.current += 1;
      const sourceEventId =
        `pomodoro-completion-${pomodoroCompletionSequenceRef.current}`;

      if (celebrationTimerRef.current !== null) {
        globalThis.clearTimeout(celebrationTimerRef.current);
      }

      setCelebrating(true);
      celebrationTimerRef.current = globalThis.setTimeout(() => {
        celebrationTimerRef.current = null;
        setCelebrating(false);
      }, POMODORO_CELEBRATION_DURATION_MS);

      if (aiInteractionRef.current.phase === 'idle') {
        showPomodoroCompletion(sourceEventId);
      } else {
        pendingPomodoroCompletionRef.current = sourceEventId;
      }
    });
  }, [showPomodoroCompletion]);

  useEffect(() => {
    const bridge = window.psyduck;

    if (bridge === undefined) {
      return;
    }

    return bridge.onCustomPomodoroDurationRequested(() => {
      setCustomPomodoroPanelRequestSequence(
        (sequence) => sequence + 1,
      );
      setCustomPomodoroPanelPresent(true);
      setCustomPomodoroPanelOpen(true);
    });
  }, []);

  useEffect(() => {
    const bridge = window.psyduck;

    if (bridge === undefined) {
      return;
    }

    return bridge.onReminderCreationPanelRequested(() => {
      returnToReminderManagerRef.current = false;
      setEditingReminder(null);
      setReminderManagerOpen(false);
      setReminderPanelRequestSequence((sequence) => sequence + 1);
      setReminderPanelPresent(true);
      setReminderPanelOpen(true);
    });
  }, []);

  useEffect(() => {
    const bridge = window.psyduck;

    if (bridge === undefined) {
      return;
    }

    return bridge.onReminderManagerPanelRequested(() => {
      returnToReminderManagerRef.current = false;
      setReminderPanelOpen(false);
      openReminderManager();
    });
  }, [openReminderManager]);

  useEffect(() => {
    const bridge = window.psyduck;

    if (bridge === undefined) {
      return;
    }

    return bridge.onDailyPlannerPanelRequested(() => {
      setDailyPlannerRequestSequence((sequence) => sequence + 1);
      setDailyPlannerPresent(true);
      setDailyPlannerOpen(true);
    });
  }, []);

  useEffect(() => {
    const bridge = window.psyduck;

    if (bridge === undefined) {
      return;
    }

    return bridge.onUserNamePanelRequested(() => {
      setUserNamePanelRequestSequence((sequence) => sequence + 1);
      setUserNamePanelPresent(true);
      setUserNamePanelOpen(true);
    });
  }, []);

  useEffect(() => {
    const bridge = window.psyduck;

    if (bridge === undefined) {
      return;
    }

    return bridge.onStickyMessagePanelRequested(() => {
      setStickyMessagePanelRequestSequence(
        (sequence) => sequence + 1,
      );
      setStickyMessagePanelPresent(true);
      setStickyMessagePanelOpen(true);
    });
  }, []);

  useEffect(() => {
    const pendingCompletionId = pendingPomodoroCompletionRef.current;

    if (
      aiInteraction.phase === 'idle' &&
      pendingCompletionId !== null
    ) {
      showPomodoroCompletion(pendingCompletionId);
    }
  }, [aiInteraction.phase, showPomodoroCompletion]);

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
      personality: personalityService,
      showMessage: (message) => {
        waterReminderSequenceRef.current += 1;
        personalityService.emitWaterReminderAcknowledgement(
          `water-reminder-${waterReminderSequenceRef.current}`,
          message,
        );
      },
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
  }, []);

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

  const psyDuckAnchor = (
    <div
      className="psyduck-anchor"
      data-celebrating={celebrating}
    >
      <PsyDuck
        activationEnabled={aiInteraction.phase === 'idle'}
        eyeTrackingEnabled={settings.general.eyeTracking}
        onActivate={handlePsyDuckActivate}
        onAnimationControllerChange={handleAnimationControllerChange}
      />
    </div>
  );

  return (
    <main
      className="app-shell"
      data-ai-state={aiInteraction.phase}
      data-pomodoro-running={pomodoroState.running}
      data-custom-pomodoro-panel-open={customPomodoroPanelOpen}
      data-user-name-panel-open={userNamePanelOpen}
      data-sticky-message-panel-open={stickyMessagePanelOpen}
      data-reminder-panel-open={reminderPanelOpen}
      data-reminder-manager-open={reminderManagerOpen}
      data-daily-planner-open={dailyPlannerOpen}
      data-reminder-widget-visible={
        reminderNotifications.current !== null
      }
      aria-label="PsyDuck desktop companion"
    >
      <CompanionWidgetStack
        anchor={psyDuckAnchor}
        onContentHeightChange={handleContentHeightChange}
      >
        {dailyPlannerPresent ? (
          <CompanionWidget
            id={COMPANION_WIDGET_IDS.dailyPlannerPanel}
          >
            <DailyPlannerPanel
              key={dailyPlannerRequestSequence}
              open={dailyPlannerOpen}
              onDismiss={handleDailyPlannerDismiss}
              onAfterClose={handleDailyPlannerAfterClose}
              onLoad={handleDailyPlannerLoad}
            />
          </CompanionWidget>
        ) : null}
        {reminderManagerPresent ? (
          <CompanionWidget
            id={COMPANION_WIDGET_IDS.reminderManagerPanel}
          >
            <ReminderManagerPanel
              key={reminderManagerRequestSequence}
              open={reminderManagerOpen}
              activeView={reminderManagerView}
              onViewChange={setReminderManagerView}
              onDismiss={handleReminderManagerDismiss}
              onAfterClose={handleReminderManagerAfterClose}
              onLoad={handleReminderManagerLoad}
              onEdit={handleReminderManagerEdit}
              onDelete={handleReminderManagerDelete}
            />
          </CompanionWidget>
        ) : null}
        {reminderPanelPresent ? (
          <CompanionWidget id={COMPANION_WIDGET_IDS.reminderPanel}>
            <ReminderCreationPanel
              key={reminderPanelRequestSequence}
              {...(editingReminder === null
                ? {}
                : { initialReminder: editingReminder })}
              open={reminderPanelOpen}
              onDismiss={handleReminderPanelDismiss}
              onSave={handleReminderSave}
              onAfterClose={handleReminderPanelAfterClose}
            />
          </CompanionWidget>
        ) : null}
        {userNamePanelPresent ? (
          <CompanionWidget id={COMPANION_WIDGET_IDS.userNamePanel}>
            <UserNamePanel
              key={userNamePanelRequestSequence}
              open={userNamePanelOpen}
              defaultName={settings.userName ?? DEFAULT_USER_NAME}
              onDismiss={handleUserNamePanelDismiss}
              onSave={handleUserNameSave}
              onAfterClose={handleUserNamePanelAfterClose}
            />
          </CompanionWidget>
        ) : null}
        {customPomodoroPanelPresent ? (
          <CompanionWidget id={COMPANION_WIDGET_IDS.pomodoroPanel}>
            <PomodoroDurationPanel
              key={customPomodoroPanelRequestSequence}
              open={customPomodoroPanelOpen}
              defaultDurationMinutes={
                pomodoroState.selectedDurationMinutes
              }
              onDismiss={handleCustomPomodoroPanelDismiss}
              onStart={handleCustomPomodoroStart}
              onAfterClose={handleCustomPomodoroPanelAfterClose}
            />
          </CompanionWidget>
        ) : null}
        {stickyMessagePanelPresent ? (
          <CompanionWidget
            id={COMPANION_WIDGET_IDS.stickyMessagePanel}
          >
            <StickyMessagePanel
              key={stickyMessagePanelRequestSequence}
              open={stickyMessagePanelOpen}
              defaultMessage={settings.stickyMessage ?? ''}
              onDismiss={handleStickyMessagePanelDismiss}
              onSave={handleStickyMessageSave}
              onAfterClose={handleStickyMessagePanelAfterClose}
            />
          </CompanionWidget>
        ) : null}
        {reminderNotifications.current === null ? null : (
          <CompanionWidget id={COMPANION_WIDGET_IDS.reminder}>
            <ReminderWidget
              notification={reminderNotifications.current}
              userName={settings.userName}
              errorMessage={reminderNotifications.errorMessage}
              snoozing={reminderNotifications.snoozing}
              onDismiss={handleReminderDismiss}
              onSnooze={reminderNotifications.snoozeCurrent}
            />
          </CompanionWidget>
        )}
        {chatInputPresent ? (
          <CompanionWidget
            id={COMPANION_WIDGET_IDS.ai}
            className="companion-widget--ai"
          >
            <ChatInputBubble
              open={aiInteraction.phase === 'input-open'}
              onCancel={handleChatInputCancel}
              onSubmit={handleChatInputSubmit}
            />
          </CompanionWidget>
        ) : null}
        {settings.stickyMessage === null ? null : (
          <CompanionWidget id={COMPANION_WIDGET_IDS.stickyMessage}>
            <StickyMessageWidget message={settings.stickyMessage} />
          </CompanionWidget>
        )}
        {speechBubble.currentMessage === null ? null : (
          <CompanionWidget id={COMPANION_WIDGET_IDS.speechBubble}>
            <SpeechBubble
              message={speechBubble.currentMessage}
              visibility={speechBubble.visibility}
              onExitTransitionEnd={
                speechBubble.notifyExitTransitionEnd
              }
            />
          </CompanionWidget>
        )}
        {pomodoroState.running ? (
          <CompanionWidget id={COMPANION_WIDGET_IDS.pomodoro}>
            <PomodoroWidget state={pomodoroState} />
          </CompanionWidget>
        ) : null}
      </CompanionWidgetStack>
    </main>
  );
}
