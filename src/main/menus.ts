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

export interface ApplicationMenuActions {
  readonly showCompanion: () => void;
  readonly openPreferences: () => void;
  readonly restart: () => void;
  readonly quit: () => void;
  readonly updateSettings: (patch: SettingsPatch) => void;
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

export const createCompanionContextMenu = (
  settings: AppSettings,
  actions: ApplicationMenuActions,
): Menu =>
  Menu.buildFromTemplate([
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
