import { contextBridge, ipcRenderer } from 'electron';

import type { AppSettings, SettingsPatch } from '../shared/settings';
import type {
  CursorPositionListener,
  DesktopBridge,
  ScreenPoint,
  SettingsChangeListener,
} from '../shared/types';

// Sandboxed preload scripts cannot require local CommonJS modules. Keep the
// runtime channel table self-contained; type-only imports above are erased.
const IPC_CHANNELS = {
  cursorPosition: 'psyduck:cursor-position',
  getCursorPosition: 'psyduck:get-cursor-position',
  moveWindow: 'psyduck:move-window',
  showCompanionContextMenu: 'psyduck:show-context-menu',
  getSettings: 'settings:get',
  updateSettings: 'settings:update',
  settingsChanged: 'settings:changed',
} as const;

const desktopBridge: DesktopBridge = Object.freeze({
  platform: process.platform,
  getCursorPosition: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getCursorPosition) as Promise<ScreenPoint>,
  onCursorPosition: (listener: CursorPositionListener) => {
    const handleCursorPosition = (_event: Electron.IpcRendererEvent, position: ScreenPoint) => {
      listener(position);
    };

    ipcRenderer.on(IPC_CHANNELS.cursorPosition, handleCursorPosition);

    return () => {
      ipcRenderer.removeListener(
        IPC_CHANNELS.cursorPosition,
        handleCursorPosition,
      );
    };
  },
  moveWindow: (position: ScreenPoint) => {
    ipcRenderer.send(IPC_CHANNELS.moveWindow, position);
  },
  showCompanionContextMenu: () => {
    ipcRenderer.send(IPC_CHANNELS.showCompanionContextMenu);
  },
  getSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getSettings) as Promise<AppSettings>,
  updateSettings: (patch: SettingsPatch) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.updateSettings,
      patch,
    ) as Promise<AppSettings>,
  onSettingsChanged: (listener: SettingsChangeListener) => {
    const handleSettingsChanged = (
      _event: Electron.IpcRendererEvent,
      settings: AppSettings,
    ): void => {
      listener(settings);
    };

    ipcRenderer.on(IPC_CHANNELS.settingsChanged, handleSettingsChanged);

    return () => {
      ipcRenderer.removeListener(
        IPC_CHANNELS.settingsChanged,
        handleSettingsChanged,
      );
    };
  },
});

contextBridge.exposeInMainWorld('psyduck', desktopBridge);
