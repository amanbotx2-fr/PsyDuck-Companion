import { useEffect, useId } from 'react';

import type { ReminderFiredNotification } from '../../shared/reminders';
import { DEFAULT_USER_NAME } from '../../shared/settings';

export interface ReminderWidgetProps {
  readonly errorMessage: string | null;
  readonly notification: ReminderFiredNotification;
  readonly onDismiss: () => void;
  readonly onSnooze: () => Promise<void>;
  readonly snoozing: boolean;
  readonly userName: string;
}

const getGreeting = (userName: string): string => {
  const normalizedName = userName.trim();

  return normalizedName.length === 0 ||
    normalizedName === DEFAULT_USER_NAME
    ? 'Hey!'
    : `Hey ${normalizedName},`;
};

export function ReminderWidget({
  errorMessage,
  notification,
  onDismiss,
  onSnooze,
  snoozing,
  userName,
}: ReminderWidgetProps) {
  const greetingId = useId();
  const titleId = useId();
  const messageId = useId();
  const errorId = useId();
  const { reminder } = notification;
  const hasMessage = reminder.message.length > 0;
  const descriptionIds = [
    hasMessage ? messageId : null,
    errorMessage === null ? null : errorId,
  ]
    .filter((value): value is string => value !== null)
    .join(' ');

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return;
      }

      event.preventDefault();
      onDismiss();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onDismiss]);

  return (
    <section
      className="reminder-widget"
      role="region"
      aria-live="assertive"
      aria-atomic="true"
      aria-labelledby={`${greetingId} ${titleId}`}
      aria-describedby={descriptionIds || undefined}
      aria-busy={snoozing}
    >
      <header className="reminder-widget__header">
        <p className="reminder-widget__greeting" id={greetingId}>
          {getGreeting(userName)}
        </p>
      </header>

      <h2 className="reminder-widget__title" id={titleId}>
        {reminder.title}
      </h2>

      {hasMessage ? (
        <p className="reminder-widget__message" id={messageId}>
          {reminder.message}
        </p>
      ) : null}

      {errorMessage === null ? null : (
        <p
          className="reminder-widget__error"
          id={errorId}
          role="status"
        >
          {errorMessage}
        </p>
      )}

      <footer className="reminder-widget__actions">
        <button
          className="floating-companion-panel__button floating-companion-panel__button--secondary"
          type="button"
          disabled={snoozing}
          onClick={onDismiss}
        >
          Dismiss
        </button>
        <button
          className="floating-companion-panel__button floating-companion-panel__button--primary"
          type="button"
          disabled={snoozing}
          onClick={() => {
            void onSnooze();
          }}
        >
          {snoozing ? 'Snoozing…' : 'Snooze 5 min'}
        </button>
      </footer>
    </section>
  );
}
