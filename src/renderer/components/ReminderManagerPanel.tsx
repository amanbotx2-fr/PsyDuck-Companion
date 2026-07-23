import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import {
  getReminderDisplayStatus,
  groupRemindersForManager,
  REMINDER_MANAGER_VIEWS,
  type ReminderDisplayStatus,
  type ReminderManagerView,
} from '../../shared/reminderManager';
import {
  getReminderSchedule,
  type Reminder,
} from '../../shared/reminders';
import { formatReminderRecurrence } from '../../shared/reminderRecurrence';
import {
  FloatingCompanionPanel,
  type FloatingCompanionPanelDismissReason,
} from './FloatingCompanionPanel';

export type ReminderManagerPanelDismissReason =
  FloatingCompanionPanelDismissReason;

export interface ReminderManagerPanelProps {
  readonly activeView: ReminderManagerView;
  readonly open: boolean;
  readonly onAfterClose: () => void;
  readonly onDelete: (id: string) => Promise<boolean>;
  readonly onDismiss: (
    reason: ReminderManagerPanelDismissReason,
  ) => void;
  readonly onEdit: (reminder: Reminder) => void;
  readonly onLoad: () => Promise<readonly Reminder[]>;
  readonly onViewChange: (view: ReminderManagerView) => void;
}

const VIEW_LABELS: Readonly<Record<ReminderManagerView, string>> = {
  upcoming: 'Upcoming',
  completed: 'Completed',
  all: 'All',
};

const STATUS_LABELS: Readonly<Record<ReminderDisplayStatus, string>> = {
  upcoming: 'Upcoming',
  overdue: 'Overdue',
  completed: 'Completed',
};

const EMPTY_MESSAGES: Readonly<Record<ReminderManagerView, string>> = {
  upcoming: 'No upcoming reminders.',
  completed: 'No completed reminders.',
  all: 'No reminders yet.',
};

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

interface ReminderCardProps {
  readonly confirmationVisible: boolean;
  readonly deleteError: string | null;
  readonly deleting: boolean;
  readonly onCancelDelete: () => void;
  readonly onConfirmDelete: () => void;
  readonly onEdit: () => void;
  readonly onRequestDelete: () => void;
  readonly reminder: Reminder;
}

function ReminderCard({
  confirmationVisible,
  deleteError,
  deleting,
  onCancelDelete,
  onConfirmDelete,
  onEdit,
  onRequestDelete,
  reminder,
}: ReminderCardProps) {
  const titleId = useId();
  const schedule = getReminderSchedule(reminder);
  const scheduledDate = new Date(schedule);
  const recurrenceLabel = formatReminderRecurrence(
    reminder.recurrence,
  );
  const status = getReminderDisplayStatus(reminder);

  return (
    <article
      className="reminder-manager-card"
      data-status={status}
      aria-labelledby={titleId}
    >
      <div className="reminder-manager-card__heading">
        <h3 className="reminder-manager-card__title" id={titleId}>
          {reminder.title}
        </h3>
        <span className="reminder-manager-card__status">
          {STATUS_LABELS[status]}
        </span>
      </div>

      {reminder.message.length > 0 ? (
        <p className="reminder-manager-card__message">
          {reminder.message}
        </p>
      ) : null}

      {recurrenceLabel === null ? null : (
        <p className="reminder-manager-card__recurrence">
          <span aria-hidden="true">↻</span>
          {recurrenceLabel}
        </p>
      )}

      <time
        className="reminder-manager-card__schedule"
        dateTime={schedule}
      >
        <span>{DATE_FORMATTER.format(scheduledDate)}</span>
        <span aria-hidden="true">·</span>
        <span>{TIME_FORMATTER.format(scheduledDate)}</span>
      </time>

      {confirmationVisible ? (
        <div
          className="reminder-manager-card__confirmation"
          role="group"
          aria-label={`Delete ${reminder.title}?`}
        >
          <p>Delete this reminder?</p>
          <div className="reminder-manager-card__confirmation-actions">
            <button
              className="reminder-manager-card__action"
              type="button"
              autoFocus
              disabled={deleting}
              onClick={onCancelDelete}
            >
              Cancel
            </button>
            <button
              className="reminder-manager-card__action reminder-manager-card__action--danger"
              type="button"
              disabled={deleting}
              onClick={onConfirmDelete}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      ) : (
        <div className="reminder-manager-card__actions">
          <button
            className="reminder-manager-card__action"
            type="button"
            disabled={deleting}
            onClick={onEdit}
          >
            Edit
          </button>
          <button
            className="reminder-manager-card__action reminder-manager-card__action--danger"
            type="button"
            disabled={deleting}
            onClick={onRequestDelete}
          >
            Delete
          </button>
        </div>
      )}

      {deleteError === null ? null : (
        <p className="reminder-manager-card__error" role="status">
          {deleteError}
        </p>
      )}
    </article>
  );
}

export function ReminderManagerPanel({
  activeView,
  open,
  onAfterClose,
  onDelete,
  onDismiss,
  onEdit,
  onLoad,
  onViewChange,
}: ReminderManagerPanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const tabPanelId = useId();
  const tabButtonRefs = useRef<
    Record<ReminderManagerView, HTMLButtonElement | null>
  >({
    upcoming: null,
    completed: null,
    all: null,
  });
  const loadRequestIdRef = useRef(0);
  const [reminders, setReminders] = useState<readonly Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmationReminderId, setConfirmationReminderId] =
    useState<string | null>(null);
  const [deletingReminderId, setDeletingReminderId] =
    useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{
    readonly reminderId: string;
    readonly message: string;
  } | null>(null);

  const loadReminders = useCallback(async (): Promise<void> => {
    if (!open) {
      return;
    }

    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setLoading(true);
    setLoadError(null);

    try {
      const nextReminders = await onLoad();

      if (loadRequestIdRef.current === requestId) {
        setReminders(nextReminders);
      }
    } catch {
      if (loadRequestIdRef.current === requestId) {
        setLoadError('Could not load reminders. Try again.');
      }
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [onLoad, open]);

  useEffect(() => {
    if (!open) {
      loadRequestIdRef.current += 1;
      return;
    }

    setConfirmationReminderId(null);
    setDeletingReminderId(null);
    setDeleteError(null);
    void loadReminders();
  }, [loadReminders, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const focusFrameId = requestAnimationFrame(() => {
      tabButtonRefs.current[activeView]?.focus({
        preventScroll: true,
      });
    });

    return () => {
      cancelAnimationFrame(focusFrameId);
    };
  }, [activeView, open]);

  const groups = groupRemindersForManager(reminders);
  const visibleGroups =
    activeView === 'all'
      ? [
          {
            id: 'upcoming',
            label: VIEW_LABELS.upcoming,
            reminders: groups.upcoming,
          },
          {
            id: 'completed',
            label: VIEW_LABELS.completed,
            reminders: groups.completed,
          },
        ]
      : [
          {
            id: activeView,
            label: VIEW_LABELS[activeView],
            reminders: groups[activeView],
          },
        ];
  const visibleCount = visibleGroups.reduce(
    (count, group) => count + group.reminders.length,
    0,
  );

  const selectView = (view: ReminderManagerView): void => {
    setConfirmationReminderId(null);
    setDeleteError(null);
    onViewChange(view);
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentView: ReminderManagerView,
  ): void => {
    const currentIndex = REMINDER_MANAGER_VIEWS.indexOf(currentView);
    let nextIndex: number | null = null;

    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % REMINDER_MANAGER_VIEWS.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex =
        (currentIndex - 1 + REMINDER_MANAGER_VIEWS.length) %
        REMINDER_MANAGER_VIEWS.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = REMINDER_MANAGER_VIEWS.length - 1;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const nextView = REMINDER_MANAGER_VIEWS[nextIndex];

    if (nextView !== undefined) {
      selectView(nextView);
      tabButtonRefs.current[nextView]?.focus({
        preventScroll: true,
      });
    }
  };

  const confirmDelete = async (reminder: Reminder): Promise<void> => {
    if (deletingReminderId !== null) {
      return;
    }

    setDeletingReminderId(reminder.id);
    setDeleteError(null);

    try {
      await onDelete(reminder.id);
      setReminders((currentReminders) =>
        currentReminders.filter(
          (candidate) => candidate.id !== reminder.id,
        ),
      );
      setConfirmationReminderId(null);
    } catch {
      setDeleteError({
        reminderId: reminder.id,
        message: 'Could not delete this reminder. Try again.',
      });
    } finally {
      setDeletingReminderId(null);
    }
  };

  return (
    <FloatingCompanionPanel
      className="reminder-manager-panel"
      open={open}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={loading || deletingReminderId !== null}
      onDismiss={(reason) => {
        if (deletingReminderId === null) {
          onDismiss(reason);
        }
      }}
      onAfterClose={onAfterClose}
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <div
        onKeyDown={(event) => {
          if (
            event.key !== 'Escape' ||
            confirmationReminderId === null ||
            deletingReminderId !== null
          ) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          setConfirmationReminderId(null);
          setDeleteError(null);
        }}
      >
        <header className="floating-companion-panel__header">
          <h2
            className="floating-companion-panel__title"
            id={titleId}
          >
            Manage Reminders
          </h2>
        </header>

        <p className="visually-hidden" id={descriptionId}>
          View, edit, or delete upcoming and completed reminders.
        </p>

        <div
          className="reminder-manager-panel__tabs"
          role="tablist"
          aria-label="Reminder views"
        >
          {REMINDER_MANAGER_VIEWS.map((view) => (
            <button
              key={view}
              ref={(element) => {
                tabButtonRefs.current[view] = element;
              }}
              className="reminder-manager-panel__tab"
              id={`${tabPanelId}-${view}-tab`}
              type="button"
              role="tab"
              aria-controls={tabPanelId}
              aria-selected={activeView === view}
              tabIndex={activeView === view ? 0 : -1}
              onClick={() => {
                selectView(view);
              }}
              onKeyDown={(event) => {
                handleTabKeyDown(event, view);
              }}
            >
              {VIEW_LABELS[view]}
            </button>
          ))}
        </div>

        <div
          className="reminder-manager-panel__list"
          id={tabPanelId}
          role="tabpanel"
          aria-labelledby={`${tabPanelId}-${activeView}-tab`}
          tabIndex={0}
        >
          {loading ? (
            <p className="reminder-manager-panel__state" role="status">
              Loading reminders…
            </p>
          ) : loadError !== null ? (
            <div className="reminder-manager-panel__state">
              <p role="status">{loadError}</p>
              <button
                className="reminder-manager-card__action"
                type="button"
                onClick={() => {
                  void loadReminders();
                }}
              >
                Retry
              </button>
            </div>
          ) : visibleCount === 0 ? (
            <p className="reminder-manager-panel__state">
              {EMPTY_MESSAGES[activeView]}
            </p>
          ) : (
            visibleGroups.map((group) =>
              group.reminders.length === 0 ? null : (
                <section
                  key={group.id}
                  className="reminder-manager-panel__group"
                  aria-label={group.label}
                >
                  {activeView === 'all' ? (
                    <h3 className="reminder-manager-panel__group-title">
                      {group.label}
                    </h3>
                  ) : null}
                  <div className="reminder-manager-panel__cards">
                    {group.reminders.map((reminder) => (
                      <ReminderCard
                        key={reminder.id}
                        reminder={reminder}
                        confirmationVisible={
                          confirmationReminderId === reminder.id
                        }
                        deleting={deletingReminderId !== null}
                        deleteError={
                          deleteError?.reminderId === reminder.id
                            ? deleteError.message
                            : null
                        }
                        onEdit={() => {
                          setConfirmationReminderId(null);
                          setDeleteError(null);
                          onEdit(reminder);
                        }}
                        onRequestDelete={() => {
                          setConfirmationReminderId(reminder.id);
                          setDeleteError(null);
                        }}
                        onCancelDelete={() => {
                          setConfirmationReminderId(null);
                          setDeleteError(null);
                        }}
                        onConfirmDelete={() => {
                          void confirmDelete(reminder);
                        }}
                      />
                    ))}
                  </div>
                </section>
              ),
            )
          )}
        </div>

        <footer className="reminder-manager-panel__footer">
          <span>
            {reminders.length}{' '}
            {reminders.length === 1 ? 'reminder' : 'reminders'}
          </span>
          <button
            className="floating-companion-panel__button floating-companion-panel__button--secondary"
            type="button"
            disabled={deletingReminderId !== null}
            onClick={() => {
              onDismiss('cancel');
            }}
          >
            Close
          </button>
        </footer>
      </div>
    </FloatingCompanionPanel>
  );
}
