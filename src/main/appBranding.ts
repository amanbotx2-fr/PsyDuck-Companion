import { app, dialog, nativeImage } from 'electron';
import { join } from 'node:path';

import {
  APP_COPYRIGHT,
  APP_DESCRIPTION,
  APP_ID,
  APP_NAME,
} from '../shared/constants';

const getRuntimeResourceRoot = (): string =>
  app.isPackaged ? process.resourcesPath : app.getAppPath();

export const getApplicationIconPath = (): string =>
  join(getRuntimeResourceRoot(), 'assets', 'icons', 'icon.png');

export const initializeApplicationBranding = (): void => {
  app.setName(APP_NAME);

  if (process.platform === 'win32') {
    app.setAppUserModelId(APP_ID);
  }
};

export const configureApplicationBranding = (): void => {
  if (process.platform !== 'darwin') {
    return;
  }

  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: app.getVersion(),
    copyright: APP_COPYRIGHT,
    credits: `${APP_DESCRIPTION}\n\nBuilt with Electron`,
  });

  const icon = nativeImage.createFromPath(getApplicationIconPath());

  if (icon.isEmpty()) {
    console.warn('[branding] application_icon_unavailable');
    return;
  }

  app.dock?.setIcon(icon);
};

export const showAboutDialog = (): void => {
  const icon = nativeImage.createFromPath(getApplicationIconPath());

  void dialog
    .showMessageBox({
      type: 'info',
      title: `About ${APP_NAME}`,
      message: APP_NAME,
      detail: `Version ${app.getVersion()}\n\n${APP_DESCRIPTION}\n\nBuilt with Electron`,
      buttons: ['OK'],
      defaultId: 0,
      noLink: true,
      ...(icon.isEmpty() ? {} : { icon }),
    })
    .catch(() => {
      console.warn('[branding] about_dialog_failed');
    });
};
