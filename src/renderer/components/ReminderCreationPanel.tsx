import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import {
  MAXIMUM_REMINDER_MESSAGE_LENGTH,
  MAXIMUM_REMINDER_TITLE_LENGTH,
  type CreateReminderInput,
} from '../../shared/reminders';
import {
  createDefaultReminderLocalSchedule,
  parseReminderLocalSchedule,
  REMINDER_TIME_STEP_MINUTES,
} from '../../shared/reminderDraft';
import {
  FloatingCompanionPanel,
  type FloatingCompanionPanelDismissReason,
} from './FloatingCompanionPanel';

export type ReminderCreationPanelDismissReason =
  FloatingCompanionPanelDismissReason;

export interface ReminderCreationPanelProps {
  readonly open: boolean;
  readonly onDismiss: (
    reason: ReminderCreationPanelDismissReason,
  ) => void;
  readonly onSave: (input: CreateReminderInput) => Promise<void>;
  readonly onAfterClose: () => void;
}

interface ReminderDraft {
  readonly title: string;
  readonly message: string;
  readonly date: string;
  readonly time: string;
}

interface ReminderDraftErrors {
  readonly title?: string;
  readonly message?: string;
  readonly date?: string;
  readonly time?: string;
  readonly form?: string;
}

const createInitialDraft = (): ReminderDraft => {
  const schedule = createDefaultReminderLocalSchedule();

  return {
    title: '',
    message: '',
    date: schedule.date,
    time: schedule.time,
  };
};

const getFirstError = (errors: ReminderDraftErrors): string | null =>
  errors.title ??
  errors.message ??
  errors.date ??
  errors.time ??
  errors.form ??
  null;

const validateDraft = (
  draft: ReminderDraft,
  nowTimestamp = Date.now(),
): ReminderDraftErrors => {
  const errors: {
    title?: string;
    message?: string;
    date?: string;
    time?: string;
  } = {};
  const title = draft.title.trim();
  const message = draft.message.trim();

  if (title.length === 0) {
    errors.title = 'Enter a title.';
  } else if (title.length > MAXIMUM_REMINDER_TITLE_LENGTH) {
    errors.title = `Use ${MAXIMUM_REMINDER_TITLE_LENGTH} characters or fewer.`;
  }

  if (message.length > MAXIMUM_REMINDER_MESSAGE_LENGTH) {
    errors.message = `Use ${MAXIMUM_REMINDER_MESSAGE_LENGTH} characters or fewer.`;
  }

  if (draft.date.length === 0) {
    errors.date = 'Choose a date.';
  }

  if (draft.time.length === 0) {
    errors.time = 'Choose a time.';
  }

  if (errors.date === undefined && errors.time === undefined) {
    const scheduledAt = parseReminderLocalSchedule(
      draft.date,
      draft.time,
    );

    if (scheduledAt === null) {
      errors.date = 'Choose a valid date and time.';
      errors.time = errors.date;
    } else if (Date.parse(scheduledAt) <= nowTimestamp) {
      errors.date = 'Choose a future date and time.';
      errors.time = errors.date;
    }
  }

  return errors;
};

const getServiceErrors = (error: unknown): ReminderDraftErrors => {
  const message = error instanceof Error ? error.message : '';

  if (/title is required/i.test(message)) {
    return { title: 'Enter a title.' };
  }

  if (/title must not exceed/i.test(message)) {
    return {
      title: `Use ${MAXIMUM_REMINDER_TITLE_LENGTH} characters or fewer.`,
    };
  }

  if (/message must not exceed/i.test(message)) {
    return {
      message: `Use ${MAXIMUM_REMINDER_MESSAGE_LENGTH} characters or fewer.`,
    };
  }

  if (/valid ISO-8601 datetime|must not be in the past/i.test(message)) {
    return {
      date: 'Choose a future date and time.',
      time: 'Choose a future date and time.',
    };
  }

  return { form: 'Could not save the reminder. Try again.' };
};

export function ReminderCreationPanel({
  open,
  onDismiss,
  onSave,
  onAfterClose,
}: ReminderCreationPanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const titleInputId = useId();
  const messageInputId = useId();
  const dateInputId = useId();
  const timeInputId = useId();
  const feedbackId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const submissionInProgressRef = useRef(false);
  const [draft, setDraft] = useState<ReminderDraft>(createInitialDraft);
  const [errors, setErrors] = useState<ReminderDraftErrors>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      submissionInProgressRef.current = false;
      setSubmitting(false);
      return;
    }

    setDraft(createInitialDraft());
    setErrors({});
    submissionInProgressRef.current = false;
    setSubmitting(false);

    const focusFrameId = requestAnimationFrame(() => {
      titleInputRef.current?.focus({ preventScroll: true });
    });

    return () => {
      cancelAnimationFrame(focusFrameId);
    };
  }, [open]);

  const focusFirstInvalidField = (
    validationErrors: ReminderDraftErrors,
  ): void => {
    if (validationErrors.title !== undefined) {
      titleInputRef.current?.focus({ preventScroll: true });
    } else if (validationErrors.message !== undefined) {
      messageInputRef.current?.focus({ preventScroll: true });
    } else if (validationErrors.date !== undefined) {
      dateInputRef.current?.focus({ preventScroll: true });
    } else if (validationErrors.time !== undefined) {
      timeInputRef.current?.focus({ preventScroll: true });
    }
  };

  const updateDraft = (nextDraft: ReminderDraft): void => {
    setDraft(nextDraft);

    if (getFirstError(errors) !== null) {
      setErrors(validateDraft(nextDraft));
    }
  };

  const submit = async (): Promise<void> => {
    if (!open || submissionInProgressRef.current) {
      return;
    }

    const validationErrors = validateDraft(draft);
    setErrors(validationErrors);

    if (getFirstError(validationErrors) !== null) {
      focusFirstInvalidField(validationErrors);
      return;
    }

    const scheduledAt = parseReminderLocalSchedule(
      draft.date,
      draft.time,
    );

    if (scheduledAt === null) {
      const scheduleErrors = {
        date: 'Choose a valid date and time.',
        time: 'Choose a valid date and time.',
      };
      setErrors(scheduleErrors);
      focusFirstInvalidField(scheduleErrors);
      return;
    }

    submissionInProgressRef.current = true;
    setSubmitting(true);

    try {
      await onSave({
        title: draft.title.trim(),
        message: draft.message.trim(),
        scheduledAt,
      });
    } catch (error) {
      const serviceErrors = getServiceErrors(error);
      submissionInProgressRef.current = false;
      setSubmitting(false);
      setErrors(serviceErrors);
      focusFirstInvalidField(serviceErrors);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void submit();
  };

  const feedback =
    getFirstError(errors) ?? 'Times use your current timezone.';

  return (
    <FloatingCompanionPanel
      className="reminder-creation-panel"
      open={open}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={submitting}
      onDismiss={(reason) => {
        if (!submissionInProgressRef.current) {
          onDismiss(reason);
        }
      }}
      onAfterClose={onAfterClose}
      onSubmit={handleSubmit}
    >
      <header className="floating-companion-panel__header">
        <span
          className="floating-companion-panel__icon"
          aria-hidden="true"
        >
          🔔
        </span>
        <h2
          className="floating-companion-panel__title"
          id={titleId}
        >
          New Reminder
        </h2>
      </header>

      <p className="visually-hidden" id={descriptionId}>
        Create a reminder with a title, message, date, and time.
      </p>

      <div className="reminder-creation-panel__field">
        <label
          className="floating-companion-panel__label"
          htmlFor={titleInputId}
        >
          Title
        </label>
        <input
          ref={titleInputRef}
          className="floating-companion-panel__input"
          id={titleInputId}
          type="text"
          maxLength={MAXIMUM_REMINDER_TITLE_LENGTH}
          value={draft.title}
          autoComplete="off"
          disabled={!open || submitting}
          tabIndex={open ? 0 : -1}
          aria-invalid={errors.title !== undefined}
          aria-describedby={feedbackId}
          onBlur={() => {
            setErrors(validateDraft(draft));
          }}
          onChange={(event) => {
            updateDraft({
              ...draft,
              title: event.currentTarget.value,
            });
          }}
        />
      </div>

      <div className="reminder-creation-panel__field">
        <label
          className="floating-companion-panel__label"
          htmlFor={messageInputId}
        >
          Message <span>(optional)</span>
        </label>
        <textarea
          ref={messageInputRef}
          className="floating-companion-panel__input floating-companion-panel__textarea"
          id={messageInputId}
          rows={2}
          maxLength={MAXIMUM_REMINDER_MESSAGE_LENGTH}
          value={draft.message}
          autoComplete="off"
          disabled={!open || submitting}
          tabIndex={open ? 0 : -1}
          aria-invalid={errors.message !== undefined}
          aria-describedby={feedbackId}
          onBlur={() => {
            setErrors(validateDraft(draft));
          }}
          onChange={(event) => {
            updateDraft({
              ...draft,
              message: event.currentTarget.value,
            });
          }}
        />
      </div>

      <div className="reminder-creation-panel__field">
        <label
          className="floating-companion-panel__label"
          htmlFor={dateInputId}
        >
          Scheduled Date
        </label>
        <input
          ref={dateInputRef}
          className="floating-companion-panel__input reminder-creation-panel__date-input"
          id={dateInputId}
          type="date"
          value={draft.date}
          disabled={!open || submitting}
          tabIndex={open ? 0 : -1}
          aria-invalid={errors.date !== undefined}
          aria-describedby={feedbackId}
          onBlur={() => {
            setErrors(validateDraft(draft));
          }}
          onChange={(event) => {
            updateDraft({
              ...draft,
              date: event.currentTarget.value,
            });
          }}
        />
      </div>

      <div className="reminder-creation-panel__field">
        <label
          className="floating-companion-panel__label"
          htmlFor={timeInputId}
        >
          Scheduled Time
        </label>
        <input
          ref={timeInputRef}
          className="floating-companion-panel__input reminder-creation-panel__time-input"
          id={timeInputId}
          type="time"
          step={REMINDER_TIME_STEP_MINUTES * 60}
          value={draft.time}
          disabled={!open || submitting}
          tabIndex={open ? 0 : -1}
          aria-invalid={errors.time !== undefined}
          aria-describedby={feedbackId}
          onBlur={() => {
            setErrors(validateDraft(draft));
          }}
          onChange={(event) => {
            updateDraft({
              ...draft,
              time: event.currentTarget.value,
            });
          }}
        />
      </div>

      <p
        className="floating-companion-panel__feedback reminder-creation-panel__feedback"
        data-error={getFirstError(errors) !== null}
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
