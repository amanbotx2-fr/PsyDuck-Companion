import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import {
  MAXIMUM_STICKY_MESSAGE_LENGTH,
  normalizeStickyMessage,
} from '../../shared/settings';
import {
  FloatingCompanionPanel,
  type FloatingCompanionPanelDismissReason,
} from './FloatingCompanionPanel';

export type StickyMessagePanelDismissReason =
  FloatingCompanionPanelDismissReason;

export interface StickyMessagePanelProps {
  readonly defaultMessage: string;
  readonly open: boolean;
  readonly onAfterClose: () => void;
  readonly onDismiss: (
    reason: StickyMessagePanelDismissReason,
  ) => void;
  readonly onSave: (message: string) => Promise<void>;
}

const getValidationMessage = (value: string): string | null => {
  if (value.trim().length === 0) {
    return 'Enter a message.';
  }

  return normalizeStickyMessage(value) === null
    ? `Use ${MAXIMUM_STICKY_MESSAGE_LENGTH} characters or fewer.`
    : null;
};

export function StickyMessagePanel({
  defaultMessage,
  open,
  onAfterClose,
  onDismiss,
  onSave,
}: StickyMessagePanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const feedbackId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const submissionInProgressRef = useRef(false);
  const [value, setValue] = useState(defaultMessage);
  const [validationMessage, setValidationMessage] = useState<
    string | null
  >(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      submissionInProgressRef.current = false;
      setSubmitting(false);
      return;
    }

    setValue(defaultMessage);
    setValidationMessage(null);
    submissionInProgressRef.current = false;
    setSubmitting(false);

    const focusFrameId = requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    });

    return () => {
      cancelAnimationFrame(focusFrameId);
    };
  }, [defaultMessage, open]);

  const submit = async (): Promise<void> => {
    if (!open || submissionInProgressRef.current) {
      return;
    }

    const message = getValidationMessage(value);
    setValidationMessage(message);

    if (message !== null) {
      inputRef.current?.focus({ preventScroll: true });
      return;
    }

    const normalizedMessage = normalizeStickyMessage(value);

    if (normalizedMessage === null) {
      return;
    }

    submissionInProgressRef.current = true;
    setSubmitting(true);

    try {
      await onSave(normalizedMessage);
    } catch {
      submissionInProgressRef.current = false;
      setSubmitting(false);
      setValidationMessage('Could not save the message. Try again.');
      inputRef.current?.focus({ preventScroll: true });
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void submit();
  };

  const feedback =
    validationMessage ??
    `${Math.max(
      MAXIMUM_STICKY_MESSAGE_LENGTH - value.length,
      0,
    )} characters remaining`;

  return (
    <FloatingCompanionPanel
      className="sticky-message-panel"
      open={open}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={submitting}
      onDismiss={onDismiss}
      onAfterClose={onAfterClose}
      onSubmit={handleSubmit}
    >
      <header className="floating-companion-panel__header">
        <h2
          className="floating-companion-panel__title"
          id={titleId}
        >
          Sticky Message
        </h2>
      </header>

      <p className="visually-hidden" id={descriptionId}>
        Set one message to keep visible above Ducky.
      </p>

      <label
        className="floating-companion-panel__label"
        htmlFor={inputId}
      >
        Message
      </label>
      <textarea
        ref={inputRef}
        className="floating-companion-panel__input floating-companion-panel__textarea sticky-message-panel__input"
        id={inputId}
        rows={3}
        maxLength={MAXIMUM_STICKY_MESSAGE_LENGTH}
        value={value}
        autoComplete="off"
        disabled={!open || submitting}
        tabIndex={open ? 0 : -1}
        aria-invalid={validationMessage !== null}
        aria-describedby={feedbackId}
        onBlur={() => {
          setValidationMessage(getValidationMessage(value));
        }}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          setValue(nextValue);

          if (validationMessage !== null) {
            setValidationMessage(getValidationMessage(nextValue));
          }
        }}
      />

      <p
        className="floating-companion-panel__feedback"
        data-error={validationMessage !== null}
        id={feedbackId}
        aria-live="polite"
      >
        {feedback}
      </p>

      <footer className="floating-companion-panel__actions">
        <button
          className="floating-companion-panel__button floating-companion-panel__button--secondary"
          type="button"
          disabled={!open || submitting}
          tabIndex={open ? 0 : -1}
          onClick={() => {
            onDismiss('cancel');
          }}
        >
          Cancel
        </button>
        <button
          className="floating-companion-panel__button floating-companion-panel__button--primary"
          type="submit"
          disabled={!open || submitting}
          tabIndex={open ? 0 : -1}
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </footer>
    </FloatingCompanionPanel>
  );
}
