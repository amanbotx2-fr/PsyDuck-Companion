import { useSyncExternalStore } from 'react';

export const SPEECH_BUBBLE_TRANSITION_DURATION_MS = 200;
export const DEFAULT_SPEECH_BUBBLE_DURATION_MS = 4_000;

const EXIT_TRANSITION_BUFFER_MS = 50;

export interface SpeechBubbleOptions {
  readonly icon?: string;
  readonly duration?: number;
  readonly persistent?: boolean;
}

export interface SpeechBubbleMessage {
  readonly id: number;
  readonly text: string;
  readonly icon: string | null;
  readonly duration: number;
  readonly persistent: boolean;
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
}

export interface SpeechBubbleController extends SpeechBubbleApi {
  readonly currentMessage: SpeechBubbleMessage | null;
  readonly visibility: SpeechBubbleVisibility;
  readonly queuedMessageCount: number;
  readonly notifyExitTransitionEnd: () => void;
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

    const normalizedIcon = options.icon?.trim() ?? '';
    const message: SpeechBubbleMessage = {
      id: this.nextMessageId,
      text: normalizedText,
      icon: normalizedIcon.length > 0 ? normalizedIcon : null,
      duration,
      persistent: options.persistent ?? false,
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

  readonly completeExit = (): void => {
    if (this.snapshot.visibility !== 'exiting') {
      return;
    }

    this.clearExitFallbackTimer();
    this.publish(null, 'hidden');

    globalThis.queueMicrotask(() => {
      if (this.snapshot.currentMessage === null) {
        this.activateNextMessage();
      }
    });
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
        this.scheduleAutoHide(nextMessage);
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
    notifyExitTransitionEnd: speechBubbleStore.completeExit,
  };
}

declare global {
  interface Window {
    show?: SpeechBubbleApi['show'];
    hide?: SpeechBubbleApi['hide'];
    clearQueue?: SpeechBubbleApi['clearQueue'];
  }
}
