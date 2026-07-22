import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type TransitionEvent,
} from 'react';

import { personalityService } from '../../personality';
import type {
  SpeechBubbleMessage,
  SpeechBubbleVisibility,
} from '../hooks/useSpeechBubble';

export interface SpeechBubbleProps {
  readonly message: SpeechBubbleMessage | null;
  readonly visibility: SpeechBubbleVisibility;
  readonly onExitTransitionEnd: () => void;
}

const SCREEN_EDGE_PADDING_PX = 8;
const BUBBLE_TOP_PX = 8;
const TAIL_EDGE_INSET_PX = 18;
const OVERFLOW_TOLERANCE_PX = 1;

interface MultiMonitorScreen extends Screen {
  readonly availLeft?: number;
  readonly availTop?: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

export function SpeechBubble({
  message,
  visibility,
  onExitTransitionEnd,
}: SpeechBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLSpanElement>(null);
  const [overflowingMessageId, setOverflowingMessageId] = useState<
    number | null
  >(null);
  const [expandedMessageId, setExpandedMessageId] = useState<number | null>(
    null,
  );
  const messageId = message?.id ?? null;
  const isOverflowing = overflowingMessageId === messageId;
  const isExpanded = isOverflowing && expandedMessageId === messageId;

  const updateLayout = useCallback((): void => {
    const bubbleElement = bubbleRef.current;
    const messageElement = messageRef.current;

    if (bubbleElement === null || messageElement === null || messageId === null) {
      return;
    }

    if (!isExpanded) {
      const overflows =
        messageElement.scrollHeight - messageElement.clientHeight >
        OVERFLOW_TOLERANCE_PX;

      setOverflowingMessageId((currentMessageId) => {
        const nextMessageId = overflows ? messageId : null;
        return currentMessageId === nextMessageId
          ? currentMessageId
          : nextMessageId;
      });
    }

    const bubbleWidth = bubbleElement.offsetWidth;
    const bubbleHeight = bubbleElement.offsetHeight;
    const anchorX = window.innerWidth / 2;
    const desiredLeft = anchorX - bubbleWidth / 2;
    const desiredTop = BUBBLE_TOP_PX;
    const browserScreen = window.screen as MultiMonitorScreen;
    const screenAvailableLeft = browserScreen.availLeft ?? 0;
    const screenAvailableTop = browserScreen.availTop ?? 0;
    const availableLeft =
      screenAvailableLeft - window.screenX + SCREEN_EDGE_PADDING_PX;
    const availableRight =
      screenAvailableLeft +
      browserScreen.availWidth -
      window.screenX -
      SCREEN_EDGE_PADDING_PX;
    const availableTop =
      screenAvailableTop - window.screenY + SCREEN_EDGE_PADDING_PX;
    const availableBottom =
      screenAvailableTop +
      browserScreen.availHeight -
      window.screenY -
      SCREEN_EDGE_PADDING_PX;
    const safeLeft = Math.max(SCREEN_EDGE_PADDING_PX, availableLeft);
    const safeRight = Math.min(
      window.innerWidth - SCREEN_EDGE_PADDING_PX,
      availableRight,
    );
    const safeTop = Math.max(SCREEN_EDGE_PADDING_PX, availableTop);
    const safeBottom = Math.min(
      window.innerHeight - SCREEN_EDGE_PADDING_PX,
      availableBottom,
    );
    const maximumLeft = safeRight - bubbleWidth;
    const maximumTop = safeBottom - bubbleHeight;
    const viewportMaximumLeft = Math.max(
      SCREEN_EDGE_PADDING_PX,
      window.innerWidth - SCREEN_EDGE_PADDING_PX - bubbleWidth,
    );
    const viewportMaximumTop = Math.max(
      SCREEN_EDGE_PADDING_PX,
      window.innerHeight - SCREEN_EDGE_PADDING_PX - bubbleHeight,
    );
    const clampedLeft =
      maximumLeft >= safeLeft
        ? clamp(desiredLeft, safeLeft, maximumLeft)
        : clamp(
            desiredLeft,
            SCREEN_EDGE_PADDING_PX,
            viewportMaximumLeft,
          );
    const clampedTop =
      maximumTop >= safeTop
        ? clamp(desiredTop, safeTop, maximumTop)
        : clamp(
            desiredTop,
            SCREEN_EDGE_PADDING_PX,
            viewportMaximumTop,
          );
    const maximumTailX = Math.max(
      TAIL_EDGE_INSET_PX,
      bubbleWidth - TAIL_EDGE_INSET_PX,
    );
    const tailX = clamp(
      anchorX - clampedLeft,
      TAIL_EDGE_INSET_PX,
      maximumTailX,
    );

    bubbleElement.style.setProperty(
      '--speech-bubble-offset-x',
      `${clampedLeft - desiredLeft}px`,
    );
    bubbleElement.style.setProperty(
      '--speech-bubble-offset-y',
      `${clampedTop - desiredTop}px`,
    );
    bubbleElement.style.setProperty(
      '--speech-bubble-tail-x',
      `${tailX}px`,
    );
  }, [isExpanded, messageId]);

  useLayoutEffect(() => {
    if (messageId === null) {
      return;
    }

    let animationFrameId: number | null = null;
    const scheduleLayoutUpdate = (): void => {
      if (animationFrameId !== null) {
        return;
      }

      animationFrameId = requestAnimationFrame(() => {
        animationFrameId = null;
        updateLayout();
      });
    };
    const resizeObserver = new ResizeObserver(scheduleLayoutUpdate);
    const bubbleElement = bubbleRef.current;
    const messageElement = messageRef.current;

    if (bubbleElement !== null) {
      resizeObserver.observe(bubbleElement);
    }

    if (messageElement !== null) {
      resizeObserver.observe(messageElement);
    }

    window.addEventListener('resize', scheduleLayoutUpdate);
    window.addEventListener('pointermove', scheduleLayoutUpdate);
    window.visualViewport?.addEventListener('resize', scheduleLayoutUpdate);
    updateLayout();

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }

      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleLayoutUpdate);
      window.removeEventListener('pointermove', scheduleLayoutUpdate);
      window.visualViewport?.removeEventListener(
        'resize',
        scheduleLayoutUpdate,
      );
    };
  }, [messageId, updateLayout]);

  if (message === null) {
    return null;
  }

  const isThinking = personalityService.isMessageInCategory(
    message.text,
    'thinking',
  );
  const thinkingLabel =
    isThinking && message.text.endsWith('...')
      ? message.text.slice(0, -3)
      : message.text;

  const handleTransitionEnd = (
    event: TransitionEvent<HTMLDivElement>,
  ): void => {
    if (
      event.currentTarget !== event.target ||
      event.propertyName !== 'opacity' ||
      visibility !== 'exiting'
    ) {
      return;
    }

    onExitTransitionEnd();
  };

  return (
    <div
      ref={bubbleRef}
      className="speech-bubble"
      data-visibility={visibility}
      data-expandable={isOverflowing}
      data-expanded={isExpanded}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      onTransitionEnd={handleTransitionEnd}
    >
      {message.icon === null ? null : (
        <span className="speech-bubble__icon" aria-hidden="true">
          {message.icon}
        </span>
      )}
      <span className="speech-bubble__body">
        <span ref={messageRef} className="speech-bubble__message">
          {isThinking ? (
            <>
              <span className="speech-bubble__thinking" aria-hidden="true">
                {thinkingLabel}
                <span className="speech-bubble__thinking-dot">.</span>
                <span className="speech-bubble__thinking-dot speech-bubble__thinking-dot--second">
                  .
                </span>
                <span className="speech-bubble__thinking-dot speech-bubble__thinking-dot--third">
                  .
                </span>
              </span>
              <span className="visually-hidden">{message.text}</span>
            </>
          ) : (
            message.text
          )}
        </span>
        {isOverflowing ? (
          <button
            className="speech-bubble__expand"
            type="button"
            aria-expanded={isExpanded}
            onClick={() => {
              setExpandedMessageId(isExpanded ? null : message.id);
            }}
          >
            {isExpanded ? 'Show less' : 'Click to expand'}
          </button>
        ) : null}
      </span>
    </div>
  );
}
