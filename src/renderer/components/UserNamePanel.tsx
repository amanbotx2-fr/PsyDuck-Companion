import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import {
  MAXIMUM_USER_NAME_LENGTH,
  normalizeUserName,
} from '../../shared/settings';
import {
  FloatingCompanionPanel,
  type FloatingCompanionPanelDismissReason,
} from './FloatingCompanionPanel';

export type UserNamePanelDismissReason =
  FloatingCompanionPanelDismissReason;

export interface UserNamePanelProps {
  readonly defaultName: string;
  readonly open: boolean;
  readonly onDismiss: (reason: UserNamePanelDismissReason) => void;
  readonly onSave: (name: string) => Promise<void>;
  readonly onAfterClose: () => void;
}

const getValidationMessage = (value: string): string | null => {
  const normalizedName = normalizeUserName(value);

  if (normalizedName !== null) {
    return null;
  }

  return value.trim().length === 0
    ? 'Enter your name.'
    : `Use ${MAXIMUM_USER_NAME_LENGTH} characters or fewer.`;
};

export function UserNamePanel({
  defaultName,
  open,
  onDismiss,
  onSave,
  onAfterClose,
}: UserNamePanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const feedbackId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const submissionInProgressRef = useRef(false);
  const [value, setValue] = useState(defaultName);
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

    setValue(defaultName);
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
  }, [defaultName, open]);

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

    const normalizedName = normalizeUserName(value);

    if (normalizedName === null) {
      return;
    }

    submissionInProgressRef.current = true;
    setSubmitting(true);

    try {
      await onSave(normalizedName);
    } catch {
      submissionInProgressRef.current = false;
      setSubmitting(false);
      setValidationMessage('Could not save your name. Try again.');
      inputRef.current?.focus({ preventScroll: true });
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void submit();
  };

  const feedback =
    validationMessage ??
    `Up to ${MAXIMUM_USER_NAME_LENGTH} characters`;

  return (
    <FloatingCompanionPanel
      className="user-name-panel"
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
          Tell me your name
        </h2>
      </header>

      <p className="visually-hidden" id={descriptionId}>
        Choose the name PsyDuck should use for you.
      </p>

      <label
        className="floating-companion-panel__label"
        htmlFor={inputId}
      >
        Name
      </label>
      <input
        ref={inputRef}
        className="floating-companion-panel__input user-name-panel__input"
        id={inputId}
        type="text"
        maxLength={MAXIMUM_USER_NAME_LENGTH}
        value={value}
        autoComplete="name"
        spellCheck={false}
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
