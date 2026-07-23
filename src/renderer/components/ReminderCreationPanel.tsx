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
  getReminderSchedule,
  type CreateReminderInput,
  type Reminder,
} from '../../shared/reminders';
import {
  isReminderIntervalUnit,
  isReminderRecurrenceType,
  MAXIMUM_REMINDER_INTERVAL_VALUE,
  MINIMUM_REMINDER_INTERVAL_VALUE,
  NO_REMINDER_RECURRENCE,
  parseReminderRecurrence,
  type ReminderIntervalUnit,
  type ReminderRecurrence,
  type ReminderRecurrenceType,
} from '../../shared/reminderRecurrence';
import {
  createDefaultReminderLocalSchedule,
  formatReminderLocalSchedule,
  parseReminderLocalSchedule,
  REMINDER_TIME_STEP_MINUTES,
  type ReminderLocalSchedule,
} from '../../shared/reminderDraft';
import {
  FloatingCompanionPanel,
  type FloatingCompanionPanelDismissReason,
} from './FloatingCompanionPanel';

export type ReminderCreationPanelDismissReason =
  FloatingCompanionPanelDismissReason;

export interface ReminderCreationPanelProps {
  readonly initialReminder?: Reminder;
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
  readonly repeat: ReminderRecurrenceType;
  readonly intervalValue: string;
  readonly intervalUnit: ReminderIntervalUnit;
}

interface ReminderDraftErrors {
  readonly title?: string;
  readonly message?: string;
  readonly date?: string;
  readonly time?: string;
  readonly recurrence?: string;
  readonly form?: string;
}

const REPEAT_OPTIONS = [
  { value: 'none', label: 'Never' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'interval', label: 'Custom' },
] as const satisfies readonly {
  readonly value: ReminderRecurrenceType;
  readonly label: string;
}[];

const createInitialDraft = (
  initialReminder?: Reminder,
): ReminderDraft => {
  const recurrence =
    initialReminder?.recurrence ?? NO_REMINDER_RECURRENCE;
  const schedule =
    (initialReminder === undefined
      ? null
      : formatReminderLocalSchedule(
          getReminderSchedule(initialReminder),
        )) ??
    createDefaultReminderLocalSchedule();

  return {
    title: initialReminder?.title ?? '',
    message: initialReminder?.message ?? '',
    date: schedule.date,
    time: schedule.time,
    repeat: recurrence.type,
    intervalValue:
      recurrence.type === 'interval'
        ? String(recurrence.value)
        : '1',
    intervalUnit:
      recurrence.type === 'interval' ? recurrence.unit : 'hours',
  };
};

const getFirstError = (errors: ReminderDraftErrors): string | null =>
  errors.title ??
  errors.message ??
  errors.date ??
  errors.time ??
  errors.recurrence ??
  errors.form ??
  null;

const createDraftRecurrence = (
  draft: ReminderDraft,
): ReminderRecurrence | null => {
  if (draft.repeat !== 'interval') {
    return parseReminderRecurrence({ type: draft.repeat });
  }

  const normalizedValue = draft.intervalValue.trim();

  if (!/^[0-9]+$/.test(normalizedValue)) {
    return null;
  }

  const value = Number(normalizedValue);

  return parseReminderRecurrence({
    type: 'interval',
    unit: draft.intervalUnit,
    value,
  });
};

const validateDraft = (
  draft: ReminderDraft,
  allowedPastSchedule: ReminderLocalSchedule | null = null,
  nowTimestamp = Date.now(),
): ReminderDraftErrors => {
  const errors: {
    title?: string;
    message?: string;
    date?: string;
    time?: string;
    recurrence?: string;
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
    } else if (
      Date.parse(scheduledAt) <= nowTimestamp &&
      !(
        allowedPastSchedule !== null &&
        draft.date === allowedPastSchedule.date &&
        draft.time === allowedPastSchedule.time
      )
    ) {
      errors.date = 'Choose a future date and time.';
      errors.time = errors.date;
    }
  }

  if (createDraftRecurrence(draft) === null) {
    errors.recurrence =
      `Enter a whole number from ${MINIMUM_REMINDER_INTERVAL_VALUE} to ${MAXIMUM_REMINDER_INTERVAL_VALUE}.`;
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

  if (/recurrence is invalid/i.test(message)) {
    return { recurrence: 'Choose a valid repeat interval.' };
  }

  return { form: 'Could not save the reminder. Try again.' };
};

export function ReminderCreationPanel({
  initialReminder,
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
  const repeatInputId = useId();
  const intervalValueInputId = useId();
  const intervalUnitInputId = useId();
  const feedbackId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const repeatInputRef = useRef<HTMLSelectElement>(null);
  const intervalValueInputRef = useRef<HTMLInputElement>(null);
  const submissionInProgressRef = useRef(false);
  const [draft, setDraft] = useState<ReminderDraft>(() =>
    createInitialDraft(initialReminder),
  );
  const [errors, setErrors] = useState<ReminderDraftErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const isEditing = initialReminder !== undefined;
  const initialSchedule =
    initialReminder === undefined
      ? null
      : formatReminderLocalSchedule(
          getReminderSchedule(initialReminder),
        );
  const validateCurrentDraft = (
    nextDraft: ReminderDraft,
  ): ReminderDraftErrors =>
    validateDraft(nextDraft, initialSchedule);

  useEffect(() => {
    if (!open) {
      submissionInProgressRef.current = false;
      setSubmitting(false);
      return;
    }

    setDraft(createInitialDraft(initialReminder));
    setErrors({});
    submissionInProgressRef.current = false;
    setSubmitting(false);

    const focusFrameId = requestAnimationFrame(() => {
      titleInputRef.current?.focus({ preventScroll: true });
    });

    return () => {
      cancelAnimationFrame(focusFrameId);
    };
  }, [initialReminder, open]);

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
    } else if (validationErrors.recurrence !== undefined) {
      if (draft.repeat === 'interval') {
        intervalValueInputRef.current?.focus({ preventScroll: true });
      } else {
        repeatInputRef.current?.focus({ preventScroll: true });
      }
    }
  };

  const updateDraft = (nextDraft: ReminderDraft): void => {
    setDraft(nextDraft);

    if (getFirstError(errors) !== null) {
      setErrors(validateCurrentDraft(nextDraft));
    }
  };

  const submit = async (): Promise<void> => {
    if (!open || submissionInProgressRef.current) {
      return;
    }

    const validationErrors = validateCurrentDraft(draft);
    setErrors(validationErrors);

    if (getFirstError(validationErrors) !== null) {
      focusFirstInvalidField(validationErrors);
      return;
    }

    const scheduledAt = parseReminderLocalSchedule(
      draft.date,
      draft.time,
    );
    const recurrence = createDraftRecurrence(draft);

    if (scheduledAt === null || recurrence === null) {
      const scheduleErrors = {
        ...(scheduledAt === null
          ? {
              date: 'Choose a valid date and time.',
              time: 'Choose a valid date and time.',
            }
          : {}),
        ...(recurrence === null
          ? { recurrence: 'Choose a valid repeat interval.' }
          : {}),
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
        recurrence,
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
          {isEditing ? 'Edit Reminder' : 'New Reminder'}
        </h2>
      </header>

      <p className="visually-hidden" id={descriptionId}>
        {isEditing
          ? 'Update this reminder’s title, message, schedule, or repeat interval.'
          : 'Create a reminder with a title, message, schedule, and optional repeat interval.'}
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
            setErrors(validateCurrentDraft(draft));
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
            setErrors(validateCurrentDraft(draft));
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
            setErrors(validateCurrentDraft(draft));
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
            setErrors(validateCurrentDraft(draft));
          }}
          onChange={(event) => {
            updateDraft({
              ...draft,
              time: event.currentTarget.value,
            });
          }}
        />
      </div>

      <div className="reminder-creation-panel__field">
        <label
          className="floating-companion-panel__label"
          htmlFor={repeatInputId}
        >
          Repeat
        </label>
        <select
          ref={repeatInputRef}
          className="floating-companion-panel__input reminder-creation-panel__select"
          id={repeatInputId}
          value={draft.repeat}
          disabled={!open || submitting}
          tabIndex={open ? 0 : -1}
          aria-invalid={errors.recurrence !== undefined}
          aria-describedby={feedbackId}
          onBlur={() => {
            setErrors(validateCurrentDraft(draft));
          }}
          onChange={(event) => {
            const repeat = event.currentTarget.value;

            if (!isReminderRecurrenceType(repeat)) {
              return;
            }

            updateDraft({
              ...draft,
              repeat,
            });
          }}
        >
          {REPEAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {draft.repeat === 'interval' ? (
        <div
          className="reminder-creation-panel__custom-repeat"
          role="group"
          aria-label="Custom repeat interval"
        >
          <div className="reminder-creation-panel__field">
            <label
              className="floating-companion-panel__label"
              htmlFor={intervalValueInputId}
            >
              Number
            </label>
            <input
              ref={intervalValueInputRef}
              className="floating-companion-panel__input"
              id={intervalValueInputId}
              type="number"
              inputMode="numeric"
              min={MINIMUM_REMINDER_INTERVAL_VALUE}
              max={MAXIMUM_REMINDER_INTERVAL_VALUE}
              step={1}
              value={draft.intervalValue}
              disabled={!open || submitting}
              tabIndex={open ? 0 : -1}
              aria-invalid={errors.recurrence !== undefined}
              aria-describedby={feedbackId}
              onBlur={() => {
                setErrors(validateCurrentDraft(draft));
              }}
              onChange={(event) => {
                updateDraft({
                  ...draft,
                  intervalValue: event.currentTarget.value,
                });
              }}
            />
          </div>

          <div className="reminder-creation-panel__field">
            <label
              className="floating-companion-panel__label"
              htmlFor={intervalUnitInputId}
            >
              Unit
            </label>
            <select
              className="floating-companion-panel__input reminder-creation-panel__select"
              id={intervalUnitInputId}
              value={draft.intervalUnit}
              disabled={!open || submitting}
              tabIndex={open ? 0 : -1}
              aria-invalid={errors.recurrence !== undefined}
              aria-describedby={feedbackId}
              onBlur={() => {
                setErrors(validateCurrentDraft(draft));
              }}
              onChange={(event) => {
                const unit = event.currentTarget.value;

                if (!isReminderIntervalUnit(unit)) {
                  return;
                }

                updateDraft({
                  ...draft,
                  intervalUnit: unit,
                });
              }}
            >
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
            </select>
          </div>
        </div>
      ) : null}

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
          {submitting
            ? 'Saving…'
            : isEditing
              ? 'Save Changes'
              : 'Save'}
        </button>
      </footer>
    </FloatingCompanionPanel>
  );
}
