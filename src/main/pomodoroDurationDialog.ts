import { execFile } from 'node:child_process';

import { dialog } from 'electron';

import {
  DEFAULT_POMODORO_DURATION_MINUTES,
  isPomodoroDuration,
  MAXIMUM_POMODORO_DURATION_MINUTES,
  MINIMUM_POMODORO_DURATION_MINUTES,
  parsePomodoroDuration,
} from '../shared/pomodoro';

const APPLE_SCRIPT_PATH = '/usr/bin/osascript';
const DIALOG_TIMEOUT_MS = 5 * 60 * 1_000;
const MAXIMUM_DIALOG_OUTPUT_BYTES = 1_024;

interface AppleScriptResult {
  readonly cancelled: boolean;
  readonly value: string;
}

const promptWithNativeMacDialog = (
  defaultDurationMinutes: number,
): Promise<AppleScriptResult> => {
  const script = [
    'display dialog "Enter a focus duration in minutes (1–240)."',
    `default answer "${defaultDurationMinutes}"`,
    'buttons {"Cancel", "Set Duration"}',
    'default button "Set Duration"',
    'cancel button "Cancel"',
    'with title "PsyDuck Pomodoro"',
    'return text returned of result',
  ].join(' ');

  return new Promise((resolve, reject) => {
    execFile(
      APPLE_SCRIPT_PATH,
      ['-e', script],
      {
        encoding: 'utf8',
        maxBuffer: MAXIMUM_DIALOG_OUTPUT_BYTES,
        timeout: DIALOG_TIMEOUT_MS,
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ cancelled: false, value: stdout.trim() });
          return;
        }

        if (
          stderr.includes('User canceled') ||
          stderr.includes('(-128)')
        ) {
          resolve({ cancelled: true, value: '' });
          return;
        }

        reject(error);
      },
    );
  });
};

const showValidationMessage = async (): Promise<boolean> => {
  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'PsyDuck Pomodoro',
    message: 'Enter a whole number from 1 to 240.',
    detail: 'The duration is measured in minutes.',
    buttons: ['Try Again', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  return result.response === 0;
};

export const requestCustomPomodoroDuration = async (
  currentDurationMinutes: number,
): Promise<number | null> => {
  const defaultDuration = isPomodoroDuration(currentDurationMinutes)
    ? currentDurationMinutes
    : DEFAULT_POMODORO_DURATION_MINUTES;

  if (process.platform !== 'darwin') {
    await dialog.showMessageBox({
      type: 'info',
      title: 'PsyDuck Pomodoro',
      message: 'Custom duration entry is available in the macOS build.',
      detail:
        `Choose a duration from ${MINIMUM_POMODORO_DURATION_MINUTES} to ` +
        `${MAXIMUM_POMODORO_DURATION_MINUTES} minutes.`,
      buttons: ['OK'],
      defaultId: 0,
      noLink: true,
    });
    return null;
  }

  while (true) {
    let result: AppleScriptResult;

    try {
      result = await promptWithNativeMacDialog(defaultDuration);
    } catch (error) {
      console.error('[pomodoro] custom_duration_dialog_failed', {
        name: error instanceof Error ? error.name : 'UnknownError',
      });
      await dialog.showMessageBox({
        type: 'error',
        title: 'PsyDuck Pomodoro',
        message: 'The custom duration dialog could not be opened.',
        buttons: ['OK'],
        defaultId: 0,
        noLink: true,
      });
      return null;
    }

    if (result.cancelled) {
      return null;
    }

    const duration = parsePomodoroDuration(result.value);

    if (duration !== null) {
      return duration;
    }

    if (!(await showValidationMessage())) {
      return null;
    }
  }
};
