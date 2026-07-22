import { app, nativeImage, Tray } from 'electron';
import { join } from 'node:path';

import { APP_NAME } from '../shared/constants';
import { createTrayMenu, type ApplicationMenuActions } from './menus';

const TRAY_ICON_SIZE = process.platform === 'darwin' ? 18 : 20;

export const createSystemTray = (
  actions: ApplicationMenuActions,
): Tray => {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'character/master.png')
    : join(app.getAppPath(), 'character/master.png');
  const sourceIcon = nativeImage.createFromPath(iconPath);

  if (sourceIcon.isEmpty()) {
    throw new Error('The packaged tray icon could not be loaded.');
  }

  const trayIcon = sourceIcon.resize({
    width: TRAY_ICON_SIZE,
    height: TRAY_ICON_SIZE,
    quality: 'best',
  });
  const tray = new Tray(trayIcon);

  tray.setToolTip(APP_NAME);
  tray.setContextMenu(createTrayMenu(actions));

  return tray;
};
