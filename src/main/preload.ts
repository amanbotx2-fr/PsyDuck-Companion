import { contextBridge, ipcRenderer } from 'electron';

import type { RuntimeSettings } from '../shared/settings';
import type {
  AIAskResult,
  CompanionBridge,
  CursorPositionListener,
  RuntimeSettingsChangeListener,
  ScreenPoint,
} from '../shared/types';

// Sandboxed preload scripts cannot require local CommonJS modules. Keep the
// runtime channel table self-contained; type-only imports above are erased.
const IPC_CHANNELS = {
  cursorPosition: 'psyduck:cursor-position',
  getCursorPosition: 'psyduck:get-cursor-position',
  moveWindow: 'psyduck:move-window',
  showCompanionContextMenu: 'psyduck:show-context-menu',
  getRuntimeSettings: 'runtime-settings:get',
  runtimeSettingsChanged: 'runtime-settings:changed',
  askAI: 'ai:ask',
} as const;

const companionBridge: CompanionBridge = Object.freeze({
  platform: process.platform,
  getCursorPosition: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getCursorPosition) as Promise<ScreenPoint>,
  onCursorPosition: (listener: CursorPositionListener) => {
    const handleCursorPosition = (
      _event: Electron.IpcRendererEvent,
      position: ScreenPoint,
    ) => {
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
  getRuntimeSettings: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.getRuntimeSettings,
    ) as Promise<RuntimeSettings>,
  askAI: (prompt: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.askAI, prompt) as Promise<AIAskResult>,
  onRuntimeSettingsChanged: (listener: RuntimeSettingsChangeListener) => {
    const handleRuntimeSettingsChanged = (
      _event: Electron.IpcRendererEvent,
      settings: RuntimeSettings,
    ): void => {
      listener(settings);
    };

    ipcRenderer.on(
      IPC_CHANNELS.runtimeSettingsChanged,
      handleRuntimeSettingsChanged,
    );

    return () => {
      ipcRenderer.removeListener(
        IPC_CHANNELS.runtimeSettingsChanged,
        handleRuntimeSettingsChanged,
      );
    };
  },
});

contextBridge.exposeInMainWorld('psyduck', companionBridge);
