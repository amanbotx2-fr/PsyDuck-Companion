import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  screen,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type Tray,
  type WebContents,
} from 'electron';
import { join } from 'node:path';

import { IPC_CHANNELS } from '../shared/events';
import {
  parseSettingsPatch,
  type AppSettings,
  type SettingsPatch,
} from '../shared/settings';
import type { ScreenPoint } from '../shared/types';
import {
  createCompanionContextMenu,
  type ApplicationMenuActions,
} from './menus';
import { createPreferencesWindow } from './preferencesWindow';
import { SettingsService } from './SettingsService';
import { createSystemTray } from './tray';
import { createMainWindow } from './window';

const CURSOR_SAMPLE_INTERVAL_MS = 1_000 / 30;
const MAX_ABSOLUTE_WINDOW_COORDINATE = 100_000;
const SETTINGS_FILE_NAME = 'settings.json';

let mainWindow: BrowserWindow | null = null;
let preferencesWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let settingsService: SettingsService | null = null;
let unsubscribeFromSettings: (() => void) | null = null;

const getSettingsService = (): SettingsService => {
  if (settingsService === null) {
    throw new Error('Settings service is not initialized.');
  }

  return settingsService;
};

const isWindowPosition = (value: unknown): value is ScreenPoint => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const position = value as Record<string, unknown>;

  return (
    typeof position.x === 'number' &&
    Number.isFinite(position.x) &&
    Math.abs(position.x) <= MAX_ABSOLUTE_WINDOW_COORDINATE &&
    typeof position.y === 'number' &&
    Number.isFinite(position.y) &&
    Math.abs(position.y) <= MAX_ABSOLUTE_WINDOW_COORDINATE
  );
};

const isManagedRenderer = (sender: WebContents): boolean => {
  const senderWindow = BrowserWindow.fromWebContents(sender);

  return senderWindow === mainWindow || senderWindow === preferencesWindow;
};

const isCompanionRenderer = (sender: WebContents): boolean =>
  BrowserWindow.fromWebContents(sender) === mainWindow;

const handleMoveWindow = (event: IpcMainEvent, position: unknown): void => {
  if (!isCompanionRenderer(event.sender) || !isWindowPosition(position)) {
    return;
  }

  const targetWindow = BrowserWindow.fromWebContents(event.sender);

  if (targetWindow === null || targetWindow.isDestroyed()) {
    return;
  }

  targetWindow.setPosition(
    Math.round(position.x),
    Math.round(position.y),
    false,
  );
};

const startCursorBroadcast = (targetWindow: BrowserWindow): void => {
  let lastPosition: ScreenPoint | null = null;
  let sampleTimer: ReturnType<typeof setInterval> | null = null;

  const sendCursorPosition = (): void => {
    if (
      targetWindow.isDestroyed() ||
      targetWindow.webContents.isDestroyed()
    ) {
      return;
    }

    const position = screen.getCursorScreenPoint();

    if (
      position.x === lastPosition?.x &&
      position.y === lastPosition.y
    ) {
      return;
    }

    lastPosition = position;
    targetWindow.webContents.send(IPC_CHANNELS.cursorPosition, position);
  };

  const beginSampling = (): void => {
    sendCursorPosition();
    sampleTimer = setInterval(
      sendCursorPosition,
      CURSOR_SAMPLE_INTERVAL_MS,
    );
  };

  if (targetWindow.webContents.isLoadingMainFrame()) {
    targetWindow.webContents.once('did-finish-load', beginSampling);
  } else {
    beginSampling();
  }

  targetWindow.once('closed', () => {
    if (sampleTimer !== null) {
      clearInterval(sampleTimer);
    }
  });
};

const openMainWindow = (): BrowserWindow => {
  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  const alwaysOnTop =
    getSettingsService().get().general.alwaysOnTop;
  const nextMainWindow = createMainWindow(alwaysOnTop);
  mainWindow = nextMainWindow;
  startCursorBroadcast(nextMainWindow);

  nextMainWindow.once('closed', () => {
    if (mainWindow === nextMainWindow) {
      mainWindow = null;
    }
  });

  return nextMainWindow;
};

const showMainWindow = (): void => {
  const targetWindow = openMainWindow();
  targetWindow.show();
  targetWindow.focus();
};

const openPreferences = (): void => {
  if (
    preferencesWindow !== null &&
    !preferencesWindow.isDestroyed()
  ) {
    preferencesWindow.show();
    preferencesWindow.focus();
    return;
  }

  const nextPreferencesWindow = createPreferencesWindow();
  preferencesWindow = nextPreferencesWindow;

  nextPreferencesWindow.once('closed', () => {
    if (preferencesWindow === nextPreferencesWindow) {
      preferencesWindow = null;
    }
  });
};

const restartApplication = (): void => {
  app.relaunch();
  app.exit(0);
};

const quitApplication = (): void => {
  app.quit();
};

const updateSettings = (patch: SettingsPatch): void => {
  void getSettingsService().update(patch).catch((error: unknown) => {
    console.error('[settings] update_failed', error);
  });
};

const getMenuActions = (): ApplicationMenuActions => ({
  showCompanion: showMainWindow,
  openPreferences,
  restart: restartApplication,
  quit: quitApplication,
  updateSettings,
});

const handleShowCompanionContextMenu = (event: IpcMainEvent): void => {
  if (
    !isCompanionRenderer(event.sender) ||
    mainWindow === null ||
    mainWindow.isDestroyed()
  ) {
    return;
  }

  createCompanionContextMenu(
    getSettingsService().get(),
    getMenuActions(),
  ).popup({ window: mainWindow });
};

const broadcastSettings = (settings: AppSettings): void => {
  for (const targetWindow of [mainWindow, preferencesWindow]) {
    if (
      targetWindow !== null &&
      !targetWindow.isDestroyed() &&
      !targetWindow.webContents.isDestroyed()
    ) {
      targetWindow.webContents.send(
        IPC_CHANNELS.settingsChanged,
        settings,
      );
    }
  }
};

const applyRuntimeSettings = (settings: AppSettings): void => {
  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(settings.general.alwaysOnTop);
  }

  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: settings.general.launchAtStartup,
    });
  }
};

const handleGetCursorPosition = (
  event: IpcMainInvokeEvent,
): ScreenPoint => {
  if (!isCompanionRenderer(event.sender)) {
    throw new Error('Cursor position is unavailable to this window.');
  }

  return screen.getCursorScreenPoint();
};

const handleGetSettings = (event: IpcMainInvokeEvent): AppSettings => {
  if (!isManagedRenderer(event.sender)) {
    throw new Error('Settings are unavailable to this window.');
  }

  return getSettingsService().get();
};

const handleUpdateSettings = async (
  event: IpcMainInvokeEvent,
  value: unknown,
): Promise<AppSettings> => {
  if (!isManagedRenderer(event.sender)) {
    throw new Error('Settings updates are unavailable to this window.');
  }

  const patch = parseSettingsPatch(value);

  if (patch === null) {
    throw new TypeError('Invalid settings update.');
  }

  return getSettingsService().update(patch);
};

const registerIpcHandlers = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.getCursorPosition,
    handleGetCursorPosition,
  );
  ipcMain.handle(IPC_CHANNELS.getSettings, handleGetSettings);
  ipcMain.handle(IPC_CHANNELS.updateSettings, handleUpdateSettings);
  ipcMain.on(IPC_CHANNELS.moveWindow, handleMoveWindow);
  ipcMain.on(
    IPC_CHANNELS.showCompanionContextMenu,
    handleShowCompanionContextMenu,
  );
};

const unregisterIpcHandlers = (): void => {
  ipcMain.removeHandler(IPC_CHANNELS.getCursorPosition);
  ipcMain.removeHandler(IPC_CHANNELS.getSettings);
  ipcMain.removeHandler(IPC_CHANNELS.updateSettings);
  ipcMain.removeListener(IPC_CHANNELS.moveWindow, handleMoveWindow);
  ipcMain.removeListener(
    IPC_CHANNELS.showCompanionContextMenu,
    handleShowCompanionContextMenu,
  );
};

Menu.setApplicationMenu(null);

void app.whenReady().then(async () => {
  settingsService = new SettingsService(
    join(app.getPath('userData'), SETTINGS_FILE_NAME),
  );

  try {
    await settingsService.load();
  } catch (error) {
    console.error('[settings] load_failed', error);
  }

  registerIpcHandlers();
  applyRuntimeSettings(settingsService.get());
  openMainWindow();

  try {
    tray = createSystemTray(getMenuActions());
  } catch (error) {
    console.error('[tray] create_failed', error);
  }

  unsubscribeFromSettings = settingsService.subscribe((settings) => {
    applyRuntimeSettings(settings);
    broadcastSettings(settings);
  });

  app.on('activate', showMainWindow);
});

app.once('before-quit', () => {
  app.removeListener('activate', showMainWindow);
  unsubscribeFromSettings?.();
  unsubscribeFromSettings = null;
  unregisterIpcHandlers();
  tray?.destroy();
  tray = null;
});
