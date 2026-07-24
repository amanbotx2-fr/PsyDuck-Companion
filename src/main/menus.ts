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
  readonly showAbout: () => void;
  readonly openPreferences: () => void;
  readonly restart: () => void;
  readonly quit: () => void;
  readonly updateSettings: (patch: SettingsPatch) => void;
  readonly getPomodoroState: () => PomodoroState;
  readonly startPomodoro: (durationMinutes: number) => void;
  readonly pausePomodoro: () => void;
  readonly resumePomodoro: () => void;
  readonly stopPomodoro: () => void;
  readonly requestCustomPomodoroDuration: () => void;
  readonly requestUserName: () => void;
  readonly requestStickyMessage: () => void;
  readonly requestReminderCreation: () => void;
  readonly requestReminderManagement: () => void;
  readonly requestDailyPlanner: () => void;
}

export const createApplicationMenu = (
  showAbout: () => void,
): Menu | null => {
  if (process.platform !== 'darwin') {
    return null;
  }

  // macOS dispatches standard text-editing accelerators through menu roles.
  return Menu.buildFromTemplate([
    {
      label: APP_NAME,
      submenu: [
        {
          label: `About ${APP_NAME}`,
          click: showAbout,
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        {
          label: `Hide ${APP_NAME}`,
          role: 'hide',
        },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        {
          label: `Quit ${APP_NAME}`,
          role: 'quit',
        },
      ],
    },
    { role: 'editMenu' },
  ]);
};

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
      ...POMODORO_DURATION_OPTIONS.map((durationMinutes) => ({
        label: `${durationMinutes} min`,
        type: 'radio' as const,
        checked: state.selectedDurationMinutes === durationMinutes,
        click: () => {
          actions.startPomodoro(durationMinutes);
        },
      })),
      { type: 'separator' as const },
      {
        label: 'Custom…',
        type: 'radio',
        checked: !presetDurations.has(state.selectedDurationMinutes),
        click: actions.requestCustomPomodoroDuration,
      },
      { type: 'separator' },
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
      label: 'Personal Assistant',
      submenu: [
        {
          label: 'Set My Name…',
          click: actions.requestUserName,
        },
        { type: 'separator' },
        {
          label: 'Reminders',
          submenu: [
            {
              label: 'New Reminder…',
              click: actions.requestReminderCreation,
            },
            {
              label: 'Manage Reminders…',
              click: actions.requestReminderManagement,
            },
          ],
        },
        {
          label: 'Daily Planner…',
          click: actions.requestDailyPlanner,
        },
        { type: 'separator' },
        {
          label: 'Sticky Message',
          submenu: [
            {
              label: 'Set Sticky Message…',
              click: actions.requestStickyMessage,
            },
            {
              label: 'Clear Sticky Message',
              enabled: settings.stickyMessage !== null,
              click: () => {
                actions.updateSettings({ stickyMessage: null });
              },
            },
          ],
        },
      ],
    },
    { type: 'separator' },
    {
      label: 'Water Reminders',
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
      label: 'Eye Tracking',
      type: 'checkbox',
      checked: settings.general.eyeTracking,
      click: (menuItem) => {
        actions.updateSettings({
          general: { eyeTracking: menuItem.checked },
        });
      },
    },
    {
      label: 'Always On Top',
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
      label: 'Preferences…',
      click: actions.openPreferences,
    },
    {
      label: `About ${APP_NAME}`,
      click: actions.showAbout,
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
    {
      label: `About ${APP_NAME}`,
      click: actions.showAbout,
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
