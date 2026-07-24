import { useSyncExternalStore } from 'react';

export const SPEECH_BUBBLE_TRANSITION_DURATION_MS = 200;
export const DEFAULT_SPEECH_BUBBLE_DURATION_MS = 4_000;

const EXIT_TRANSITION_BUFFER_MS = 50;
const MAXIMUM_SPEECH_BUBBLE_ACTIONS = 3;

export type SpeechBubbleVariant = 'notification' | 'conversation';
export type SpeechBubbleFormat = 'plain' | 'markdown';

export interface SpeechBubbleAction {
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
}

export interface SpeechBubbleOptions {
  readonly icon?: string;
  readonly duration?: number;
  readonly persistent?: boolean;
  readonly variant?: SpeechBubbleVariant;
  readonly format?: SpeechBubbleFormat;
  readonly pending?: boolean;
  readonly typewriter?: boolean;
  readonly actions?: readonly SpeechBubbleAction[];
}

export interface SpeechBubbleMessage {
  readonly id: number;
  readonly text: string;
  readonly icon: string | null;
  readonly duration: number;
  readonly persistent: boolean;
  readonly variant: SpeechBubbleVariant;
  readonly format: SpeechBubbleFormat;
  readonly pending: boolean;
  readonly typewriter: boolean;
  readonly actions: readonly SpeechBubbleAction[];
}

export type SpeechBubbleVisibility =
  | 'hidden'
  | 'entering'
  | 'visible'
  | 'exiting';

export interface SpeechBubbleSnapshot {
  readonly currentMessage: SpeechBubbleMessage | null;
  readonly visibility: SpeechBubbleVisibility;
  readonly queuedMessageCount: number;
}

export interface SpeechBubbleApi {
  readonly show: (
    text: string,
    options?: SpeechBubbleOptions,
  ) => number;
  readonly hide: () => void;
  readonly clearQueue: () => void;
  readonly setCurrentPersistent: (persistent: boolean) => void;
}

export interface SpeechBubbleController extends SpeechBubbleApi {
  readonly currentMessage: SpeechBubbleMessage | null;
  readonly visibility: SpeechBubbleVisibility;
  readonly queuedMessageCount: number;
  readonly notifyExitTransitionEnd: () => void;
  readonly notifyContentReady: (messageId: number) => void;
}

type SpeechBubbleListener = () => void;

const INITIAL_SNAPSHOT: SpeechBubbleSnapshot = {
  currentMessage: null,
  visibility: 'hidden',
  queuedMessageCount: 0,
};

class SpeechBubbleStore {
  private readonly listeners = new Set<SpeechBubbleListener>();
  private readonly queue: SpeechBubbleMessage[] = [];
  private snapshot: SpeechBubbleSnapshot = INITIAL_SNAPSHOT;
  private nextMessageId = 1;
  private entryFrameId: number | null = null;
  private autoHideTimerId: ReturnType<typeof globalThis.setTimeout> | null =
    null;
  private exitFallbackTimerId: ReturnType<typeof globalThis.setTimeout> | null =
    null;
  private contentReadyMessageId: number | null = null;

  readonly subscribe = (listener: SpeechBubbleListener): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): SpeechBubbleSnapshot => this.snapshot;

  readonly show = (
    text: string,
    options: SpeechBubbleOptions = {},
  ): number => {
    const normalizedText = text.trim();

    if (normalizedText.length === 0) {
      throw new TypeError('Speech bubble text must not be empty.');
    }

    const duration =
      options.duration ?? DEFAULT_SPEECH_BUBBLE_DURATION_MS;

    if (!Number.isFinite(duration) || duration < 0) {
      throw new RangeError(
        'Speech bubble duration must be a finite, non-negative number.',
      );
    }

    const pending = options.pending ?? false;
    const typewriter = options.typewriter ?? false;

    if (pending && typewriter) {
      throw new TypeError(
        'A speech bubble cannot be pending and use a typewriter animation.',
      );
    }

    const actions = options.actions ?? [];

    if (actions.length > MAXIMUM_SPEECH_BUBBLE_ACTIONS) {
      throw new RangeError(
        `A speech bubble supports at most ${MAXIMUM_SPEECH_BUBBLE_ACTIONS} actions.`,
      );
    }

    const actionIds = new Set<string>();
    const normalizedActions = actions.map((action) => {
      const id = action.id.trim();
      const label = action.label.trim();

      if (
        id.length === 0 ||
        label.length === 0 ||
        actionIds.has(id) ||
        typeof action.onSelect !== 'function'
      ) {
        throw new TypeError(
          'Speech bubble actions require unique, non-empty IDs and labels plus a handler.',
        );
      }

      actionIds.add(id);
      return {
        id,
        label,
        onSelect: action.onSelect,
      };
    });

    const normalizedIcon = options.icon?.trim() ?? '';
    const message: SpeechBubbleMessage = {
      id: this.nextMessageId,
      text: normalizedText,
      icon: normalizedIcon.length > 0 ? normalizedIcon : null,
      duration,
      persistent: options.persistent ?? false,
      variant: options.variant ?? 'notification',
      format: options.format ?? 'plain',
      pending,
      typewriter,
      actions: normalizedActions,
    };

    this.nextMessageId += 1;
    this.queue.push(message);

    if (this.snapshot.currentMessage === null) {
      this.activateNextMessage();
    } else {
      this.publish(
        this.snapshot.currentMessage,
        this.snapshot.visibility,
      );
    }

    return message.id;
  };

  readonly hide = (): void => {
    const { currentMessage, visibility } = this.snapshot;

    if (currentMessage === null || visibility === 'exiting') {
      return;
    }

    this.cancelEntryFrame();
    this.clearAutoHideTimer();
    this.publish(currentMessage, 'exiting');

    this.clearExitFallbackTimer();
    this.exitFallbackTimerId = globalThis.setTimeout(
      this.completeExit,
      SPEECH_BUBBLE_TRANSITION_DURATION_MS +
        EXIT_TRANSITION_BUFFER_MS,
    );
  };

  readonly clearQueue = (): void => {
    if (this.queue.length === 0) {
      return;
    }

    this.queue.splice(0);
    this.publish(
      this.snapshot.currentMessage,
      this.snapshot.visibility,
    );
  };

  readonly setCurrentPersistent = (persistent: boolean): void => {
    const { currentMessage, visibility } = this.snapshot;

    if (
      currentMessage === null ||
      currentMessage.persistent === persistent
    ) {
      return;
    }

    const nextMessage = {
      ...currentMessage,
      persistent,
    };

    this.clearAutoHideTimer();
    this.publish(nextMessage, visibility);

    if (
      !persistent &&
      visibility === 'visible' &&
      (!nextMessage.typewriter ||
        this.contentReadyMessageId === nextMessage.id)
    ) {
      this.scheduleAutoHide(nextMessage);
    }
  };

  readonly completeExit = (): void => {
    if (this.snapshot.visibility !== 'exiting') {
      return;
    }

    this.clearExitFallbackTimer();
    this.contentReadyMessageId = null;
    this.publish(null, 'hidden');

    globalThis.queueMicrotask(() => {
      if (this.snapshot.currentMessage === null) {
        this.activateNextMessage();
      }
    });
  };

  readonly notifyContentReady = (messageId: number): void => {
    const { currentMessage, visibility } = this.snapshot;

    if (
      currentMessage?.id !== messageId ||
      !currentMessage.typewriter
    ) {
      return;
    }

    this.contentReadyMessageId = messageId;

    if (visibility === 'visible') {
      this.scheduleAutoHide(currentMessage);
    }
  };

  private activateNextMessage(): void {
    if (this.snapshot.currentMessage !== null) {
      return;
    }

    const nextMessage = this.queue.shift();

    if (nextMessage === undefined) {
      this.publish(null, 'hidden');
      return;
    }

    this.contentReadyMessageId = null;
    this.publish(nextMessage, 'entering');
    this.cancelEntryFrame();
    this.entryFrameId = requestAnimationFrame(() => {
      this.entryFrameId = requestAnimationFrame(() => {
        this.entryFrameId = null;

        if (
          this.snapshot.currentMessage?.id !== nextMessage.id ||
          this.snapshot.visibility !== 'entering'
        ) {
          return;
        }

        this.publish(nextMessage, 'visible');

        if (
          !nextMessage.typewriter ||
          this.contentReadyMessageId === nextMessage.id
        ) {
          this.scheduleAutoHide(nextMessage);
        }
      });
    });
  }

  private scheduleAutoHide(message: SpeechBubbleMessage): void {
    this.clearAutoHideTimer();

    if (message.persistent) {
      return;
    }

    this.autoHideTimerId = globalThis.setTimeout(
      this.hide,
      message.duration,
    );
  }

  private publish(
    currentMessage: SpeechBubbleMessage | null,
    visibility: SpeechBubbleVisibility,
  ): void {
    this.snapshot = {
      currentMessage,
      visibility,
      queuedMessageCount: this.queue.length,
    };

    for (const listener of this.listeners) {
      listener();
    }
  }

  private cancelEntryFrame(): void {
    if (this.entryFrameId === null) {
      return;
    }

    cancelAnimationFrame(this.entryFrameId);
    this.entryFrameId = null;
  }

  private clearAutoHideTimer(): void {
    if (this.autoHideTimerId === null) {
      return;
    }

    globalThis.clearTimeout(this.autoHideTimerId);
    this.autoHideTimerId = null;
  }

  private clearExitFallbackTimer(): void {
    if (this.exitFallbackTimerId === null) {
      return;
    }

    globalThis.clearTimeout(this.exitFallbackTimerId);
    this.exitFallbackTimerId = null;
  }
}

const speechBubbleStore = new SpeechBubbleStore();

export const show: SpeechBubbleApi['show'] = speechBubbleStore.show;
export const hide: SpeechBubbleApi['hide'] = speechBubbleStore.hide;
export const clearQueue: SpeechBubbleApi['clearQueue'] =
  speechBubbleStore.clearQueue;
export const setCurrentPersistent: SpeechBubbleApi['setCurrentPersistent'] =
  speechBubbleStore.setCurrentPersistent;

export function useSpeechBubble(): SpeechBubbleController {
  const snapshot = useSyncExternalStore(
    speechBubbleStore.subscribe,
    speechBubbleStore.getSnapshot,
    speechBubbleStore.getSnapshot,
  );

  return {
    ...snapshot,
    show,
    hide,
    clearQueue,
    setCurrentPersistent,
    notifyExitTransitionEnd: speechBubbleStore.completeExit,
    notifyContentReady: speechBubbleStore.notifyContentReady,
  };
}

declare global {
  interface Window {
    show?: SpeechBubbleApi['show'];
    hide?: SpeechBubbleApi['hide'];
    clearQueue?: SpeechBubbleApi['clearQueue'];
  }
}
