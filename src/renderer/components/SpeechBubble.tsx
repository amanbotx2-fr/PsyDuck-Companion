import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type TransitionEvent,
} from 'react';

import type { AIConversationMessage } from '../../shared/aiConversation';
import { speechBubbleMarkdownToPlainText } from '../../shared/speechBubbleMarkdown';
import type {
  SpeechBubbleMessage,
  SpeechBubbleVisibility,
} from '../hooks/useSpeechBubble';
import { useTypewriterText } from '../hooks/useTypewriterText';
import { SpeechBubbleMarkdown } from './SpeechBubbleMarkdown';

export interface SpeechBubbleProps {
  readonly message: SpeechBubbleMessage | null;
  readonly visibility: SpeechBubbleVisibility;
  readonly conversation?: SpeechBubbleConversation | undefined;
  readonly onExitTransitionEnd: () => void;
  readonly onContentReady: (messageId: number) => void;
}

export interface SpeechBubbleConversation {
  readonly messages: readonly AIConversationMessage[];
  readonly pinned: boolean;
  readonly canContinue: boolean;
  readonly onContinue: () => void;
  readonly onClose: () => void;
  readonly onTogglePin: () => void;
}

const VIEWPORT_GUTTER_PX = 8;
const TAIL_EDGE_GUTTER_PX = 20;
const MAXIMUM_SCROLL_HEIGHT_PX = 176;

const normalizePendingLabel = (text: string): string => {
  const label = text.replace(/[.\s]+$/u, '').trim();
  return label.length > 0 ? label : 'Thinking';
};

export function SpeechBubble({
  message,
  visibility,
  conversation,
  onExitTransitionEnd,
  onContentReady,
}: SpeechBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const horizontalShiftRef = useRef(0);
  const messageId = message?.id ?? 0;
  const accessibleMessageText = useMemo(() => {
    if (message === null || message.format === 'plain') {
      return message?.text ?? '';
    }

    return speechBubbleMarkdownToPlainText(message.text);
  }, [message]);
  const typewriterActive =
    message?.typewriter === true &&
    (visibility === 'visible' || visibility === 'exiting');
  const handleTypewriterComplete = useCallback((): void => {
    if (message !== null) {
      onContentReady(message.id);
    }
  }, [message, onContentReady]);
  const typewriter = useTypewriterText({
    active: typewriterActive,
    enabled: message?.typewriter ?? false,
    onComplete: handleTypewriterComplete,
    resetKey: messageId,
    text: message?.text ?? '',
  });

  const updateGeometry = useCallback((): void => {
    const bubble = bubbleRef.current;

    if (bubble === null) {
      return;
    }

    const rect = bubble.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const baseLeft = rect.left - horizontalShiftRef.current;
    const baseRight = rect.right - horizontalShiftRef.current;
    const minimumLeft = VIEWPORT_GUTTER_PX;
    const maximumRight = viewportWidth - VIEWPORT_GUTTER_PX;
    let nextShift = 0;

    if (baseLeft < minimumLeft) {
      nextShift = minimumLeft - baseLeft;
    } else if (baseRight > maximumRight) {
      nextShift = maximumRight - baseRight;
    }

    const anchor = document.querySelector<HTMLElement>('.psyduck-anchor');
    const anchorCenter =
      anchor === null
        ? viewportWidth / 2
        : anchor.getBoundingClientRect().left +
          anchor.getBoundingClientRect().width / 2;
    const shiftedLeft = baseLeft + nextShift;
    const tailPosition = Math.min(
      Math.max(anchorCenter - shiftedLeft, TAIL_EDGE_GUTTER_PX),
      Math.max(
        rect.width - TAIL_EDGE_GUTTER_PX,
        TAIL_EDGE_GUTTER_PX,
      ),
    );

    horizontalShiftRef.current = nextShift;
    bubble.style.setProperty(
      '--speech-bubble-shift-x',
      `${nextShift}px`,
    );
    bubble.style.setProperty(
      '--speech-bubble-tail-x',
      `${tailPosition}px`,
    );
  }, []);

  useLayoutEffect(() => {
    if (message === null) {
      return;
    }

    const bubble = bubbleRef.current;
    const content = contentRef.current;
    const scroll = scrollRef.current;

    if (bubble === null || content === null || scroll === null) {
      return;
    }

    let animationFrameId: number | null = null;
    let shouldScrollToLatest = true;
    const updateLayout = (): void => {
      animationFrameId = null;
      const contentHeight = Math.min(
        Math.ceil(content.scrollHeight),
        MAXIMUM_SCROLL_HEIGHT_PX,
      );

      scroll.style.setProperty(
        '--speech-bubble-scroll-height',
        `${contentHeight}px`,
      );

      if (
        (message.typewriter && !typewriter.complete) ||
        shouldScrollToLatest
      ) {
        scroll.scrollTop = scroll.scrollHeight;
        shouldScrollToLatest = false;
      }

      updateGeometry();
    };
    const scheduleLayoutUpdate = (): void => {
      if (animationFrameId === null) {
        animationFrameId = requestAnimationFrame(updateLayout);
      }
    };
    const resizeObserver = new ResizeObserver(scheduleLayoutUpdate);
    resizeObserver.observe(bubble);
    resizeObserver.observe(content);
    window.addEventListener('resize', scheduleLayoutUpdate);
    updateLayout();

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }

      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleLayoutUpdate);
    };
  }, [messageId, message?.typewriter, typewriter.complete, updateGeometry]);

  if (message === null) {
    return null;
  }

  const handleTransitionEnd = (
    event: TransitionEvent<HTMLDivElement>,
  ): void => {
    if (
      event.currentTarget !== event.target ||
      event.propertyName !== 'opacity'
    ) {
      return;
    }

    if (visibility === 'exiting') {
      onExitTransitionEnd();
    } else if (visibility === 'visible') {
      updateGeometry();
    }
  };
  const visualText = message.typewriter
    ? typewriter.displayedText
    : message.text;
  const conversationVisible =
    message.variant === 'conversation' && conversation !== undefined;
  const conversationMessages =
    conversationVisible &&
    message.pending &&
    conversation.messages.at(-1)?.role === 'assistant'
      ? conversation.messages.slice(0, -1)
      : (conversation?.messages ?? []);
  const visualContent = message.pending ? (
    <div className="speech-bubble__pending" aria-hidden="true">
      <span className="speech-bubble__pending-label">
        {normalizePendingLabel(message.text)}
      </span>
      <span className="speech-bubble__typing-indicator">
        <span />
        <span />
        <span />
      </span>
    </div>
  ) : message.format === 'markdown' ? (
    <SpeechBubbleMarkdown text={visualText} />
  ) : (
    <p className="speech-bubble__plain-text">{visualText}</p>
  );
  const conversationContent = conversationVisible ? (
    <div
      className="speech-bubble__transcript"
      role="log"
      aria-label="Conversation messages"
      aria-live="polite"
      aria-relevant="additions text"
    >
      {conversationMessages.map((conversationMessage, index) => {
        const isLatestMessage =
          index === conversationMessages.length - 1;
        const typewritingLatestResponse =
          conversationMessage.role === 'assistant' &&
          isLatestMessage &&
          message.typewriter &&
          !typewriter.complete;
        const content =
          typewritingLatestResponse
            ? visualText
            : conversationMessage.content;

        return (
          <div
            key={conversationMessage.id}
            className="speech-bubble__turn"
            data-role={conversationMessage.role}
          >
            <span className="speech-bubble__turn-speaker">
              {conversationMessage.role === 'user' ? 'You' : 'Ducky'}
            </span>
            <div
              className="speech-bubble__turn-content"
              aria-hidden={
                typewritingLatestResponse ? 'true' : undefined
              }
            >
              {conversationMessage.role === 'assistant' ? (
                <SpeechBubbleMarkdown text={content} />
              ) : (
                <p>{content}</p>
              )}
            </div>
            {typewritingLatestResponse ? (
              <span className="visually-hidden">
                {speechBubbleMarkdownToPlainText(
                  conversationMessage.content,
                )}
              </span>
            ) : null}
          </div>
        );
      })}
      {message.pending ? (
        <div
          className="speech-bubble__turn"
          data-role="assistant"
        >
          <span className="speech-bubble__turn-speaker">Ducky</span>
          <div className="speech-bubble__turn-content">
            {visualContent}
          </div>
          <span className="visually-hidden">Ducky is responding.</span>
        </div>
      ) : null}
    </div>
  ) : null;
  const continueDisabled =
    !conversationVisible ||
    !conversation.canContinue ||
    (message.typewriter && !typewriter.complete);

  return (
    <div
      ref={bubbleRef}
      className="speech-bubble"
      data-visibility={visibility}
      data-variant={message.variant}
      data-pending={message.pending}
      data-typewriting={message.typewriter && !typewriter.complete}
      role={conversationVisible ? 'region' : 'status'}
      aria-label={
        conversationVisible ? 'Ducky conversation' : undefined
      }
      aria-live={conversationVisible ? undefined : 'polite'}
      aria-atomic={conversationVisible ? undefined : 'true'}
      aria-busy={
        message.pending || (message.typewriter && !typewriter.complete)
      }
      onTransitionEnd={handleTransitionEnd}
    >
      {message.variant === 'conversation' ? (
        <div className="speech-bubble__header">
          <span className="speech-bubble__speaker">Ducky</span>
          <div className="speech-bubble__header-actions">
            {message.pending ? (
              <span className="speech-bubble__state">Responding</span>
            ) : null}
            {conversationVisible ? (
              <button
                className="speech-bubble__pin"
                type="button"
                data-pinned={conversation.pinned}
                aria-pressed={conversation.pinned}
                aria-label={
                  conversation.pinned
                    ? 'Unpin conversation'
                    : 'Pin conversation'
                }
                onClick={conversation.onTogglePin}
              >
                <span aria-hidden="true">📌</span>
                {conversation.pinned ? 'Unpin' : 'Pin'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="speech-bubble__layout">
        {message.icon === null ? null : (
          <span className="speech-bubble__icon" aria-hidden="true">
            {message.icon}
          </span>
        )}
        <div
          ref={scrollRef}
          className="speech-bubble__scroll"
          tabIndex={0}
        >
          <div
            ref={contentRef}
            className="speech-bubble__content"
            aria-hidden={
              !conversationVisible && message.typewriter
                ? 'true'
                : undefined
            }
          >
            {conversationVisible ? conversationContent : visualContent}
          </div>
          {!conversationVisible &&
          (message.pending || message.typewriter) ? (
            <span className="visually-hidden">
              {accessibleMessageText}
            </span>
          ) : null}
        </div>
      </div>
      {conversationVisible ? (
        <div
          className="speech-bubble__actions"
          aria-label="Conversation actions"
        >
          <button
            className="speech-bubble__action speech-bubble__action--primary"
            type="button"
            disabled={continueDisabled}
            onClick={conversation.onContinue}
          >
            Continue Chat
          </button>
          <button
            className="speech-bubble__action"
            type="button"
            onClick={conversation.onClose}
          >
            Close
          </button>
        </div>
      ) : message.actions.length > 0 ? (
        <div
          className="speech-bubble__actions"
          aria-label="Response actions"
        >
          {message.actions.map((action) => (
            <button
              key={action.id}
              className="speech-bubble__action"
              type="button"
              onClick={action.onSelect}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
