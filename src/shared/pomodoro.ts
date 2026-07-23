export const POMODORO_DURATION_OPTIONS = [25, 50, 90] as const;
export const DEFAULT_POMODORO_DURATION_MINUTES = 25;
export const MINIMUM_POMODORO_DURATION_MINUTES = 1;
export const MAXIMUM_POMODORO_DURATION_MINUTES = 720;
export const POMODORO_COMPLETION_MESSAGE =
  'Focus complete.\n\nTake a short break.';

export type PomodoroPresetDuration =
  (typeof POMODORO_DURATION_OPTIONS)[number];

export interface PomodoroState {
  readonly running: boolean;
  readonly paused: boolean;
  readonly selectedDurationMinutes: number;
  readonly durationMinutes: number;
  readonly remainingSeconds: number;
  readonly startedAt: number | null;
}

export type PomodoroStateListener = (state: PomodoroState) => void;
export type PomodoroCompletionListener = () => void;
export type PomodoroCustomDurationRequestListener = () => void;

export const isPomodoroDuration = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= MINIMUM_POMODORO_DURATION_MINUTES &&
  value <= MAXIMUM_POMODORO_DURATION_MINUTES;

export const parsePomodoroDuration = (value: string): number | null => {
  const normalizedValue = value.trim();

  if (!/^[0-9]{1,3}$/.test(normalizedValue)) {
    return null;
  }

  const duration = Number(normalizedValue);
  return isPomodoroDuration(duration) ? duration : null;
};

export const createIdlePomodoroState = (
  selectedDurationMinutes = DEFAULT_POMODORO_DURATION_MINUTES,
): PomodoroState => {
  if (!isPomodoroDuration(selectedDurationMinutes)) {
    throw new RangeError('The Pomodoro duration is outside the valid range.');
  }

  return {
    running: false,
    paused: false,
    selectedDurationMinutes,
    durationMinutes: selectedDurationMinutes,
    remainingSeconds: 0,
    startedAt: null,
  };
};

export const clonePomodoroState = (
  state: PomodoroState,
): PomodoroState => ({ ...state });

export const formatPomodoroTime = (remainingSeconds: number): string => {
  const normalizedSeconds = Number.isFinite(remainingSeconds)
    ? Math.max(0, Math.floor(remainingSeconds))
    : 0;
  const minutes = Math.floor(normalizedSeconds / 60);
  const seconds = normalizedSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};
