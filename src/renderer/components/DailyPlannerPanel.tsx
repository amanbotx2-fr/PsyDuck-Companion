import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import type { DailyPlannerBriefing } from '../../shared/dailyPlanner';
import {
  FloatingCompanionPanel,
  type FloatingCompanionPanelDismissReason,
} from './FloatingCompanionPanel';

export type DailyPlannerPanelDismissReason =
  FloatingCompanionPanelDismissReason;

export interface DailyPlannerPanelProps {
  readonly open: boolean;
  readonly onAfterClose: () => void;
  readonly onDismiss: (
    reason: DailyPlannerPanelDismissReason,
  ) => void;
  readonly onLoad: () => Promise<DailyPlannerBriefing>;
}

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

export function DailyPlannerPanel({
  open,
  onAfterClose,
  onDismiss,
  onLoad,
}: DailyPlannerPanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const scheduleTitleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const loadRequestIdRef = useRef(0);
  const [briefing, setBriefing] =
    useState<DailyPlannerBriefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadBriefing = useCallback(async (): Promise<void> => {
    if (!open) {
      return;
    }

    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setLoading(true);
    setLoadError(null);

    try {
      const nextBriefing = await onLoad();

      if (loadRequestIdRef.current === requestId) {
        setBriefing(nextBriefing);
      }
    } catch {
      if (loadRequestIdRef.current === requestId) {
        setBriefing(null);
        setLoadError('Could not load today’s schedule. Try again.');
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

    setBriefing(null);
    void loadBriefing();

    const focusFrameId = requestAnimationFrame(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
    });

    return () => {
      cancelAnimationFrame(focusFrameId);
    };
  }, [loadBriefing, open]);

  return (
    <FloatingCompanionPanel
      className="daily-planner-panel"
      open={open}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={loading}
      onDismiss={onDismiss}
      onAfterClose={onAfterClose}
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <header className="floating-companion-panel__header">
        <span
          className="floating-companion-panel__icon"
          aria-hidden="true"
        >
          ☀️
        </span>
        <h2
          className="floating-companion-panel__title"
          id={titleId}
        >
          Daily Planner
        </h2>
      </header>

      <p className="visually-hidden" id={descriptionId}>
        A read-only overview of your remaining reminders today.
      </p>

      {loading ? (
        <p className="daily-planner-panel__state" role="status">
          Loading today’s schedule…
        </p>
      ) : loadError !== null ? (
        <div className="daily-planner-panel__state">
          <p role="status">{loadError}</p>
          <button
            className="reminder-manager-card__action"
            type="button"
            disabled={!open}
            tabIndex={open ? 0 : -1}
            onClick={() => {
              void loadBriefing();
            }}
          >
            Retry
          </button>
        </div>
      ) : briefing === null ? null : (
        <div className="daily-planner-panel__content">
          <p className="daily-planner-panel__greeting">
            {briefing.greeting}
          </p>

          <section aria-labelledby={scheduleTitleId}>
            <h3
              className="daily-planner-panel__section-title"
              id={scheduleTitleId}
            >
              Today’s Schedule
            </h3>

            {briefing.reminders.length === 0 ? (
              <p className="daily-planner-panel__empty">
                Nothing scheduled today.
              </p>
            ) : (
              <ol className="daily-planner-panel__schedule">
                {briefing.reminders.map((reminder) => {
                  const scheduledDate = new Date(
                    reminder.scheduledAt,
                  );

                  return (
                    <li
                      className="daily-planner-panel__item"
                      key={reminder.id}
                    >
                      <time
                        className="daily-planner-panel__time"
                        dateTime={reminder.scheduledAt}
                      >
                        {TIME_FORMATTER.format(scheduledDate)}
                      </time>
                      <span className="daily-planner-panel__reminder-title">
                        {reminder.title}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      )}

      <footer className="floating-companion-panel__actions daily-planner-panel__footer">
        <button
          ref={closeButtonRef}
          className="floating-companion-panel__button floating-companion-panel__button--primary"
          type="button"
          disabled={!open}
          tabIndex={open ? 0 : -1}
          onClick={() => {
            onDismiss('cancel');
          }}
        >
          Close
        </button>
      </footer>
    </FloatingCompanionPanel>
  );
}
