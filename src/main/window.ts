import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';

import { APP_NAME } from '../shared/constants';
import { getApplicationIconPath } from './appBranding';
import { electronPermissionPolicy } from './permissionPolicy';
import {
  hardenRendererNavigation,
  loadRenderer,
} from './rendererSecurity';

const WINDOW_WIDTH = 220;
const WINDOW_HEIGHT = 220;
const WINDOW_MARGIN = 24;

export const setCompanionContentHeight = (
  browserWindow: BrowserWindow,
  requestedHeight: number,
): void => {
  if (browserWindow.isDestroyed()) {
    return;
  }

  const currentBounds = browserWindow.getBounds();
  const { workArea } = screen.getDisplayMatching(currentBounds);
  const nextHeight = Math.max(
    WINDOW_HEIGHT,
    Math.min(Math.ceil(requestedHeight), workArea.height),
  );

  if (currentBounds.height === nextHeight) {
    return;
  }

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
): BrowserWindow => {
  const { workArea } = screen.getPrimaryDisplay();
  const height = Math.min(WINDOW_HEIGHT, workArea.height);
  const x = workArea.x + workArea.width - WINDOW_WIDTH - WINDOW_MARGIN;
  const y = workArea.y + workArea.height - height - WINDOW_MARGIN;

  const mainWindow = new BrowserWindow({
    title: APP_NAME,
    icon: getApplicationIconPath(),
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
