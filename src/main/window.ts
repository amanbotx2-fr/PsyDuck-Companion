import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';

import { APP_NAME, RENDERER_DEV_URL_ENV } from '../shared/constants';

const WINDOW_WIDTH = 220;
const WINDOW_HEIGHT = 220;
const WINDOW_MARGIN = 24;

export const createMainWindow = (): BrowserWindow => {
  const { workArea } = screen.getPrimaryDisplay();
  const x = workArea.x + workArea.width - WINDOW_WIDTH - WINDOW_MARGIN;
  const y = workArea.y + workArea.height - WINDOW_HEIGHT - WINDOW_MARGIN;

  const mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    hasShadow: false,
    titleBarStyle: 'hidden',
    useContentSize: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setMenu(null);

  if (process.platform === 'darwin') {
    mainWindow.setWindowButtonVisibility(false);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const rendererDevUrl = process.env[RENDERER_DEV_URL_ENV];

  if (rendererDevUrl !== undefined) {
    void mainWindow.loadURL(rendererDevUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
};
