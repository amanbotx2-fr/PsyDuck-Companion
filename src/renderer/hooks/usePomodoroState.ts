import { useEffect, useState } from 'react';

import {
  createIdlePomodoroState,
  type PomodoroState,
} from '../../shared/pomodoro';

const INITIAL_STATE = createIdlePomodoroState();

export const usePomodoroState = (): PomodoroState => {
  const [state, setState] = useState<PomodoroState>(
    () => window.psyduck?.getPomodoroState() ?? INITIAL_STATE,
  );

  useEffect(() => {
    const bridge = window.psyduck;

    if (bridge === undefined) {
      return;
    }

    const currentState = bridge.getPomodoroState();

    if (currentState !== null) {
      setState(currentState);
    }

    return bridge.onPomodoroStateChanged(setState);
  }, []);

  return state;
};
