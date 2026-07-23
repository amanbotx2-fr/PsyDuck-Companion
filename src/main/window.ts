import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';

import { APP_NAME } from '../shared/constants';
import { electronPermissionPolicy } from './permissionPolicy';
import {
  hardenRendererNavigation,
  loadRenderer,
} from './rendererSecurity';

const WINDOW_WIDTH = 220;
const WINDOW_HEIGHT = 220;
const WINDOW_HEIGHT_WITH_POMODORO = 440;
const WINDOW_MARGIN = 24;

export const setPomodoroWidgetSpace = (
  browserWindow: BrowserWindow,
  visible: boolean,
): void => {
  if (browserWindow.isDestroyed()) {
    return;
  }

  const currentBounds = browserWindow.getBounds();
  const nextHeight = visible
    ? WINDOW_HEIGHT_WITH_POMODORO
    : WINDOW_HEIGHT;

  if (currentBounds.height === nextHeight) {
    return;
  }

  const { workArea } = screen.getDisplayMatching(currentBounds);
  const currentBottom = currentBounds.y + currentBounds.height;
  const maximumY =
    workArea.y + Math.max(0, workArea.height - nextHeight);
  const nextY = Math.min(
    Math.max(currentBottom - nextHeight, workArea.y),
    maximumY,
  );

  browserWindow.setBounds(
    {
      x: currentBounds.x,
      y: nextY,
      width: currentBounds.width,
      height: nextHeight,
    },
    false,
  );
};

export const createMainWindow = (
  alwaysOnTop = true,
  pomodoroVisible = false,
): BrowserWindow => {
  const { workArea } = screen.getPrimaryDisplay();
  const height = pomodoroVisible
    ? WINDOW_HEIGHT_WITH_POMODORO
    : WINDOW_HEIGHT;
  const x = workArea.x + workArea.width - WINDOW_WIDTH - WINDOW_MARGIN;
  const y = workArea.y + workArea.height - height - WINDOW_MARGIN;

  const mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: WINDOW_WIDTH,
    height,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop,
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

  electronPermissionPolicy.registerWindow(mainWindow, 'companion');
  mainWindow.setMenu(null);

  if (process.platform === 'darwin') {
    mainWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: false,
    });
    mainWindow.setWindowButtonVisibility(false);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  hardenRendererNavigation(mainWindow);
  loadRenderer(mainWindow, 'companion');

  return mainWindow;
};
