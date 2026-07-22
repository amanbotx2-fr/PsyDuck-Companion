import { contextBridge } from 'electron';

import type { DesktopBridge } from '../shared/types';

const desktopBridge: DesktopBridge = Object.freeze({
  platform: process.platform,
});

contextBridge.exposeInMainWorld('psyduck', desktopBridge);
