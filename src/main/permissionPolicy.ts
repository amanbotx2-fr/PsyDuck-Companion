import type { BrowserWindow, Session, WebContents } from 'electron';

import type { RendererRole } from './ipcAuthorization';

type PermissionDenialSource = 'check' | 'device' | 'request';

export interface PermissionDenial {
  readonly permission: string;
  readonly rendererRole: RendererRole | 'unknown';
  readonly source: PermissionDenialSource;
}

type PermissionDenialLogger = (denial: PermissionDenial) => void;

const logPermissionDenial: PermissionDenialLogger = (denial) => {
  console.warn('[security] electron_permission_denied', denial);
};

export class ElectronPermissionPolicy {
  private readonly installedSessions = new WeakSet<Session>();
  private readonly rendererRoles = new WeakMap<WebContents, RendererRole>();

  public constructor(
    private readonly logDenial: PermissionDenialLogger =
      logPermissionDenial,
  ) {}

  public registerWindow(
    browserWindow: BrowserWindow,
    role: RendererRole,
  ): void {
    const { webContents } = browserWindow;
    this.rendererRoles.set(webContents, role);
    this.installForSession(webContents.session);
  }

  private installForSession(targetSession: Session): void {
    if (this.installedSessions.has(targetSession)) {
      return;
    }

    targetSession.setPermissionRequestHandler(
      (webContents, permission, callback) => {
        this.reportDenial(permission, 'request', webContents);
        callback(false);
      },
    );

    targetSession.setPermissionCheckHandler(
      (webContents, permission) => {
        this.reportDenial(permission, 'check', webContents);
        return false;
      },
    );

    if (
      typeof targetSession.setDevicePermissionHandler === 'function'
    ) {
      targetSession.setDevicePermissionHandler((details) => {
        // Device permission details do not identify their WebContents.
        this.reportDenial(details.deviceType, 'device', null);
        return false;
      });
    }

    this.installedSessions.add(targetSession);
  }

  private reportDenial(
    permission: string,
    source: PermissionDenialSource,
    webContents: WebContents | null,
  ): void {
    try {
      this.logDenial({
        permission,
        rendererRole:
          webContents === null
            ? 'unknown'
            : (this.rendererRoles.get(webContents) ?? 'unknown'),
        source,
      });
    } catch {
      // Logging failures must never change the deny-by-default result.
    }
  }
}

export const electronPermissionPolicy = new ElectronPermissionPolicy();
