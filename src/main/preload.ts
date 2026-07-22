import { contextBridge, ipcRenderer } from 'electron';

import type {
  CursorPositionListener,
  DesktopBridge,
  ScreenPoint,
} from '../shared/types';

const CURSOR_POSITION_CHANNEL = 'psyduck:cursor-position';
const GET_CURSOR_POSITION_CHANNEL = 'psyduck:get-cursor-position';
const MOVE_WINDOW_CHANNEL = 'psyduck:move-window';

const desktopBridge: DesktopBridge = Object.freeze({
  platform: process.platform,
  getCursorPosition: () =>
    ipcRenderer.invoke(GET_CURSOR_POSITION_CHANNEL) as Promise<ScreenPoint>,
  onCursorPosition: (listener: CursorPositionListener) => {
    const handleCursorPosition = (_event: Electron.IpcRendererEvent, position: ScreenPoint) => {
      listener(position);
    };

    ipcRenderer.on(CURSOR_POSITION_CHANNEL, handleCursorPosition);

    return () => {
      ipcRenderer.removeListener(CURSOR_POSITION_CHANNEL, handleCursorPosition);
    };
  },
  moveWindow: (position: ScreenPoint) => {
    ipcRenderer.send(MOVE_WINDOW_CHANNEL, position);
  },
});

contextBridge.exposeInMainWorld('psyduck', desktopBridge);
