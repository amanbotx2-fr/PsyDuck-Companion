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

const OVERFLOW_TOLERANCE_PX = 1;

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

  const updateOverflow = useCallback((): void => {
    const messageElement = messageRef.current;

    if (messageElement === null || messageId === null || isExpanded) {
      return;
    }

    const overflows =
      messageElement.scrollHeight - messageElement.clientHeight >
      OVERFLOW_TOLERANCE_PX;

    setOverflowingMessageId((currentMessageId) => {
      const nextMessageId = overflows ? messageId : null;
      return currentMessageId === nextMessageId
        ? currentMessageId
        : nextMessageId;
    });
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
        updateOverflow();
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

    updateOverflow();

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }

      resizeObserver.disconnect();
    };
  }, [messageId, updateOverflow]);

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
