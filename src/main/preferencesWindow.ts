import { BrowserWindow, nativeTheme } from 'electron';
import { join } from 'node:path';

import { APP_NAME, RENDERER_DEV_URL_ENV } from '../shared/constants';

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
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  preferencesWindow.setMenu(null);
  preferencesWindow.once('ready-to-show', () => {
    preferencesWindow.show();
  });
  preferencesWindow.webContents.setWindowOpenHandler(() => ({
    action: 'deny',
  }));
  preferencesWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  const rendererDevUrl = process.env[RENDERER_DEV_URL_ENV];

  if (rendererDevUrl !== undefined) {
    const preferencesUrl = new URL('/preferences.html', rendererDevUrl);
    void preferencesWindow.loadURL(preferencesUrl.toString());
  } else {
    void preferencesWindow.loadFile(
      join(__dirname, '../renderer/preferences.html'),
    );
  }

  return preferencesWindow;
};
