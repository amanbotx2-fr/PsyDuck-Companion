import { formatPomodoroTime } from '../../shared/pomodoro';
import { usePomodoroState } from '../hooks/usePomodoroState';

export function PomodoroWidget() {
  const state = usePomodoroState();

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
        <span aria-hidden="true">🍅</span>
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
