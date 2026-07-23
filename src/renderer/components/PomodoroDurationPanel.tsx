import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import {
  DEFAULT_POMODORO_DURATION_MINUTES,
  isPomodoroDuration,
  MAXIMUM_POMODORO_DURATION_MINUTES,
  MINIMUM_POMODORO_DURATION_MINUTES,
  parsePomodoroDuration,
} from '../../shared/pomodoro';
import {
  FloatingCompanionPanel,
  type FloatingCompanionPanelDismissReason,
} from './FloatingCompanionPanel';

export type PomodoroDurationPanelDismissReason =
  FloatingCompanionPanelDismissReason;

export interface PomodoroDurationPanelProps {
  readonly open: boolean;
  readonly defaultDurationMinutes: number;
  readonly onDismiss: (
    reason: PomodoroDurationPanelDismissReason,
  ) => void;
  readonly onStart: (durationMinutes: number) => Promise<void>;
  readonly onAfterClose: () => void;
}

const getValidationMessage = (value: string): string | null => {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    return 'Enter a duration.';
  }

  if (!/^[0-9]+$/.test(normalizedValue)) {
    return 'Use a whole number of minutes.';
  }

  if (parsePomodoroDuration(normalizedValue) === null) {
    return `Choose between ${MINIMUM_POMODORO_DURATION_MINUTES} and ${MAXIMUM_POMODORO_DURATION_MINUTES} minutes.`;
  }

  return null;
};

export function PomodoroDurationPanel({
  open,
  defaultDurationMinutes,
  onDismiss,
  onStart,
  onAfterClose,
}: PomodoroDurationPanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const feedbackId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const submissionInProgressRef = useRef(false);
  const [value, setValue] = useState(
    String(defaultDurationMinutes),
  );
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

    const initialDuration = isPomodoroDuration(defaultDurationMinutes)
      ? defaultDurationMinutes
      : DEFAULT_POMODORO_DURATION_MINUTES;
    setValue(String(initialDuration));
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
  }, [defaultDurationMinutes, open]);

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

    const durationMinutes = parsePomodoroDuration(value);

    if (durationMinutes === null) {
      return;
    }

    submissionInProgressRef.current = true;
    setSubmitting(true);

    try {
      await onStart(durationMinutes);
    } catch {
      submissionInProgressRef.current = false;
      setSubmitting(false);
      setValidationMessage('Could not start the timer. Try again.');
      inputRef.current?.focus({ preventScroll: true });
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void submit();
  };

  const feedback =
    validationMessage ??
    `${MINIMUM_POMODORO_DURATION_MINUTES} to ${MAXIMUM_POMODORO_DURATION_MINUTES} minutes`;

  return (
    <FloatingCompanionPanel
      className="pomodoro-duration-panel"
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
        <span
          className="floating-companion-panel__icon"
          aria-hidden="true"
        >
          🍅
        </span>
        <h2
          className="floating-companion-panel__title"
          id={titleId}
        >
          Focus Timer
        </h2>
      </header>

      <p className="visually-hidden" id={descriptionId}>
        Choose a custom focus session duration.
      </p>

      <label
        className="floating-companion-panel__label"
        htmlFor={inputId}
      >
        Minutes
      </label>
      <input
        ref={inputRef}
        className="floating-companion-panel__input pomodoro-duration-panel__input"
        id={inputId}
        type="text"
        inputMode="numeric"
        maxLength={3}
        value={value}
        autoComplete="off"
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
          {submitting ? 'Starting…' : 'Start'}
        </button>
      </footer>
    </FloatingCompanionPanel>
  );
}
