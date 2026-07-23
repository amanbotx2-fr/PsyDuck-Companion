import {
  formatPomodoroTime,
  type PomodoroState,
} from '../../shared/pomodoro';

export interface PomodoroWidgetProps {
  readonly state: PomodoroState;
}

export function PomodoroWidget({ state }: PomodoroWidgetProps) {

  if (!state.running) {
    return null;
  }

  const formattedTime = formatPomodoroTime(state.remainingSeconds);
  const statusLabel = state.paused ? 'Paused' : 'Focus';

  return (
    <section
      className="pomodoro-widget"
      data-paused={state.paused}
      role="timer"
      aria-live="off"
      aria-label={`${statusLabel} timer, ${formattedTime} remaining`}
    >
      <span className="pomodoro-widget__label">
        {statusLabel}
      </span>
      <time
        className="pomodoro-widget__time"
        dateTime={`PT${state.remainingSeconds}S`}
      >
        {formattedTime}
      </time>
    </section>
  );
}
