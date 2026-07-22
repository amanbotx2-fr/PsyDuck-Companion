import type { TransitionEvent } from 'react';

import type {
  SpeechBubbleMessage,
  SpeechBubbleVisibility,
} from '../hooks/useSpeechBubble';

export interface SpeechBubbleProps {
  readonly message: SpeechBubbleMessage | null;
  readonly visibility: SpeechBubbleVisibility;
  readonly onExitTransitionEnd: () => void;
}

export function SpeechBubble({
  message,
  visibility,
  onExitTransitionEnd,
}: SpeechBubbleProps) {
  if (message === null) {
    return null;
  }

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
      className="speech-bubble"
      data-visibility={visibility}
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
      <span className="speech-bubble__message">{message.text}</span>
    </div>
  );
}
