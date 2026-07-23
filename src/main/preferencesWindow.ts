import { BrowserWindow, nativeTheme } from 'electron';
import { join } from 'node:path';

import { APP_NAME } from '../shared/constants';
import {
  hardenRendererNavigation,
  loadRenderer,
} from './rendererSecurity';

const PREFERENCES_WINDOW_WIDTH = 640;
const PREFERENCES_WINDOW_HEIGHT = 650;
const PREFERENCES_WINDOW_MINIMUM_WIDTH = 520;
const PREFERENCES_WINDOW_MINIMUM_HEIGHT = 480;

export const createPreferencesWindow = (): BrowserWindow => {
  const preferencesWindow = new BrowserWindow({
    title: `${APP_NAME} Preferences`,
    width: PREFERENCES_WINDOW_WIDTH,
    height: PREFERENCES_WINDOW_HEIGHT,
    minWidth: PREFERENCES_WINDOW_MINIMUM_WIDTH,
    minHeight: PREFERENCES_WINDOW_MINIMUM_HEIGHT,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors
      ? '#1f1d1a'
      : '#f7f4ec',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preferencesPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  preferencesWindow.setMenu(null);
  preferencesWindow.once('ready-to-show', () => {
    preferencesWindow.show();
  });
  hardenRendererNavigation(preferencesWindow);
  loadRenderer(preferencesWindow, 'preferences');

  return preferencesWindow;
};
