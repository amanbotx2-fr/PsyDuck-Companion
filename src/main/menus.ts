import {
  Menu,
  type MenuItemConstructorOptions,
} from 'electron';

import {
  WATER_REMINDER_INTERVAL_OPTIONS,
  type AppSettings,
  type SettingsPatch,
  type WaterReminderInterval,
} from '../shared/settings';
import { APP_NAME } from '../shared/constants';
import {
  POMODORO_DURATION_OPTIONS,
  type PomodoroState,
} from '../shared/pomodoro';

export interface ApplicationMenuActions {
  readonly showCompanion: () => void;
  readonly openPreferences: () => void;
  readonly restart: () => void;
  readonly quit: () => void;
  readonly updateSettings: (patch: SettingsPatch) => void;
  readonly getPomodoroState: () => PomodoroState;
  readonly startPomodoro: () => void;
  readonly pausePomodoro: () => void;
  readonly resumePomodoro: () => void;
  readonly stopPomodoro: () => void;
  readonly setPomodoroDuration: (durationMinutes: number) => void;
  readonly selectCustomPomodoroDuration: () => Promise<void>;
}

const createIntervalMenu = (
  activeInterval: WaterReminderInterval,
  updateSettings: ApplicationMenuActions['updateSettings'],
): MenuItemConstructorOptions[] =>
  WATER_REMINDER_INTERVAL_OPTIONS.map((interval) => ({
    label: `${interval} min`,
    type: 'radio',
    checked: activeInterval === interval,
    click: () => {
      updateSettings({ water: { interval } });
    },
  }));

const createPomodoroMenu = (
  actions: ApplicationMenuActions,
): MenuItemConstructorOptions => {
  const state = actions.getPomodoroState();
  const presetDurations = new Set<number>(POMODORO_DURATION_OPTIONS);

  return {
    label: 'Pomodoro',
    submenu: [
      {
        label: 'Start Focus Session',
        enabled: !state.running,
        click: actions.startPomodoro,
      },
      {
        label: 'Pause',
        enabled: state.running && !state.paused,
        click: actions.pausePomodoro,
      },
      {
        label: 'Resume',
        enabled: state.running && state.paused,
        click: actions.resumePomodoro,
      },
      {
        label: 'Stop',
        enabled: state.running,
        click: actions.stopPomodoro,
      },
      { type: 'separator' },
      {
        label: 'Duration',
        submenu: [
          ...POMODORO_DURATION_OPTIONS.map((durationMinutes) => ({
            label: `${durationMinutes} Minutes`,
            type: 'radio' as const,
            checked:
              state.selectedDurationMinutes === durationMinutes,
            click: () => {
              actions.setPomodoroDuration(durationMinutes);
            },
          })),
          {
            label: 'Custom…',
            type: 'radio',
            checked: !presetDurations.has(
              state.selectedDurationMinutes,
            ),
            click: () => {
              void actions.selectCustomPomodoroDuration();
            },
          },
        ],
      },
    ],
  };
};

export const createCompanionContextMenu = (
  settings: AppSettings,
  actions: ApplicationMenuActions,
): Menu =>
  Menu.buildFromTemplate([
    createPomodoroMenu(actions),
    { type: 'separator' },
    {
      label: '💧 Water Reminders',
      submenu: [
        {
          label: 'Enabled',
          type: 'checkbox',
          checked: settings.water.enabled,
          click: (menuItem) => {
            actions.updateSettings({
              water: { enabled: menuItem.checked },
            });
          },
        },
        {
          label: 'Reminder Interval',
          submenu: createIntervalMenu(
            settings.water.interval,
            actions.updateSettings,
          ),
        },
      ],
    },
    { type: 'separator' },
    {
      label: '👀 Eye Tracking',
      type: 'checkbox',
      checked: settings.general.eyeTracking,
      click: (menuItem) => {
        actions.updateSettings({
          general: { eyeTracking: menuItem.checked },
        });
      },
    },
    {
      label: '📌 Always On Top',
      type: 'checkbox',
      checked: settings.general.alwaysOnTop,
      click: (menuItem) => {
        actions.updateSettings({
          general: { alwaysOnTop: menuItem.checked },
        });
      },
    },
    { type: 'separator' },
    {
      label: '⚙ Preferences…',
      click: actions.openPreferences,
    },
    { type: 'separator' },
    {
      label: 'Restart',
      click: actions.restart,
    },
    {
      label: 'Quit',
      click: actions.quit,
    },
  ]);

export const createTrayMenu = (
  actions: ApplicationMenuActions,
): Menu =>
  Menu.buildFromTemplate([
    {
      label: `Show ${APP_NAME}`,
      click: actions.showCompanion,
    },
    {
      label: 'Preferences…',
      click: actions.openPreferences,
    },
    { type: 'separator' },
    {
      label: 'Restart',
      click: actions.restart,
    },
    {
      label: 'Quit',
      click: actions.quit,
    },
  ]);
