import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron';

import { IPC_CHANNELS } from '../shared/events';
import type { ScreenPoint } from '../shared/types';
import { createMainWindow } from './window';

const CURSOR_SAMPLE_INTERVAL_MS = 1_000 / 30;

const startCursorBroadcast = (mainWindow: BrowserWindow): void => {
  let lastPosition: ScreenPoint | null = null;
  let sampleTimer: ReturnType<typeof setInterval> | null = null;

  const sendCursorPosition = (): void => {
    if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
      return;
    }

    const position = screen.getCursorScreenPoint();

    if (position.x === lastPosition?.x && position.y === lastPosition.y) {
      return;
    }

    lastPosition = position;
    mainWindow.webContents.send(IPC_CHANNELS.cursorPosition, position);
  };

  const beginSampling = (): void => {
    sendCursorPosition();
    sampleTimer = setInterval(sendCursorPosition, CURSOR_SAMPLE_INTERVAL_MS);
  };

  if (mainWindow.webContents.isLoadingMainFrame()) {
    mainWindow.webContents.once('did-finish-load', beginSampling);
  } else {
    beginSampling();
  }

  mainWindow.once('closed', () => {
    if (sampleTimer !== null) {
      clearInterval(sampleTimer);
    }
  });
};

const openMainWindow = (): BrowserWindow => {
  const mainWindow = createMainWindow();
  startCursorBroadcast(mainWindow);
  return mainWindow;
};

Menu.setApplicationMenu(null);

void app.whenReady().then(() => {
  ipcMain.handle(IPC_CHANNELS.getCursorPosition, () => screen.getCursorScreenPoint());
  openMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openMainWindow();
    }
  });
});

app.once('before-quit', () => {
  ipcMain.removeHandler(IPC_CHANNELS.getCursorPosition);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
