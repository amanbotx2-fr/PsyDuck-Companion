import {
  BrowserWindow,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type WebContents,
} from 'electron';

import { IPC_CHANNELS } from '../shared/events';

export const RENDERER_CAPABILITIES = {
  companion: [
    IPC_CHANNELS.askAI,
    IPC_CHANNELS.getRuntimeSettings,
    IPC_CHANNELS.updateUserName,
    IPC_CHANNELS.updateStickyMessage,
    IPC_CHANNELS.moveWindow,
    IPC_CHANNELS.setCompanionContentHeight,
    IPC_CHANNELS.showCompanionContextMenu,
    IPC_CHANNELS.getCursorPosition,
    IPC_CHANNELS.startPomodoro,
    IPC_CHANNELS.customPomodoroPanelClosed,
    IPC_CHANNELS.createReminder,
    IPC_CHANNELS.updateReminder,
    IPC_CHANNELS.deleteReminder,
    IPC_CHANNELS.getReminder,
    IPC_CHANNELS.listReminders,
    IPC_CHANNELS.markReminderCompleted,
    IPC_CHANNELS.getDailyPlanner,
  ],
  preferences: [
    IPC_CHANNELS.getPreferencesSettings,
    IPC_CHANNELS.updatePreferencesSettings,
    IPC_CHANNELS.updateAiConfiguration,
    IPC_CHANNELS.listAIModels,
    IPC_CHANNELS.testAIConnection,
    IPC_CHANNELS.getUpdateStatus,
    IPC_CHANNELS.checkForUpdates,
  ],
} as const;

export type RendererRole = keyof typeof RENDERER_CAPABILITIES;
export type IpcCapabilityChannel =
  (typeof RENDERER_CAPABILITIES)[RendererRole][number];

export interface RendererAuthorizationTarget {
  readonly browserWindow: BrowserWindow | null;
  readonly expectedUrl: string | null;
}

export interface IpcAuthorizationDependencies {
  readonly getTarget: (
    role: RendererRole,
  ) => RendererAuthorizationTarget;
  readonly resolveBrowserWindow?: (
    sender: WebContents,
  ) => BrowserWindow | null;
  readonly logDenial?: (
    details: IpcAuthorizationDenial,
  ) => void;
}

export interface IpcAuthorizationDenial {
  readonly channel: string;
  readonly expectedRole: RendererRole | 'unregistered';
  readonly reason: string;
}

type AuthorizationEvent = Pick<
  IpcMainEvent | IpcMainInvokeEvent,
  'sender' | 'senderFrame'
>;
type InvokeHandler<Arguments extends unknown[], Result> = (
  event: IpcMainInvokeEvent,
  ...args: Arguments
) => Result | Promise<Result>;
type EventHandler<Arguments extends unknown[]> = (
  event: IpcMainEvent,
  ...args: Arguments
) => void;

const ROLE_BY_CHANNEL = new Map<string, RendererRole>();

for (const [role, channels] of Object.entries(
  RENDERER_CAPABILITIES,
) as [RendererRole, readonly IpcCapabilityChannel[]][]) {
  for (const channel of channels) {
    if (ROLE_BY_CHANNEL.has(channel)) {
      throw new Error(`IPC capability is assigned more than once: ${channel}`);
    }

    ROLE_BY_CHANNEL.set(channel, role);
  }
}

export const IPC_PERMISSION_DENIED_MESSAGE = 'IPC permission denied.';

export class IpcPermissionError extends Error {
  public constructor() {
    super(IPC_PERMISSION_DENIED_MESSAGE);
    this.name = 'IpcPermissionError';
  }
}

export class IpcAuthorizer {
  private readonly getTarget: IpcAuthorizationDependencies['getTarget'];
  private readonly resolveBrowserWindow: (
    sender: WebContents,
  ) => BrowserWindow | null;
  private readonly logDenial: (
    details: IpcAuthorizationDenial,
  ) => void;

  public constructor(dependencies: IpcAuthorizationDependencies) {
    this.getTarget = dependencies.getTarget;
    this.resolveBrowserWindow =
      dependencies.resolveBrowserWindow ??
      ((sender) => BrowserWindow.fromWebContents(sender));
    this.logDenial =
      dependencies.logDenial ??
      ((details) => {
        console.warn('[security] ipc_request_denied', details);
      });
  }

  public authorize(
    event: AuthorizationEvent,
    channel: string,
  ): boolean {
    const expectedRole = ROLE_BY_CHANNEL.get(channel);

    if (expectedRole === undefined) {
      return this.deny(channel, 'unregistered', 'capability_not_registered');
    }

    try {
      const senderFrame = event.senderFrame;

      if (senderFrame === null || senderFrame === undefined) {
        return this.deny(channel, expectedRole, 'sender_frame_missing');
      }

      if (event.sender.isDestroyed()) {
        return this.deny(channel, expectedRole, 'sender_destroyed');
      }

      // Same-origin subframes do not inherit their window's capabilities.
      if (senderFrame !== event.sender.mainFrame) {
        return this.deny(channel, expectedRole, 'subframe_not_allowed');
      }

      const target = this.getTarget(expectedRole);
      const targetWindow = target.browserWindow;

      if (
        targetWindow === null ||
        targetWindow.isDestroyed() ||
        targetWindow.webContents.isDestroyed()
      ) {
        return this.deny(channel, expectedRole, 'target_window_unavailable');
      }

      if (
        targetWindow.webContents !== event.sender ||
        this.resolveBrowserWindow(event.sender) !== targetWindow
      ) {
        return this.deny(channel, expectedRole, 'browser_window_mismatch');
      }

      if (
        target.expectedUrl === null ||
        senderFrame.url !== target.expectedUrl
      ) {
        return this.deny(channel, expectedRole, 'renderer_url_mismatch');
      }

      return true;
    } catch {
      return this.deny(channel, expectedRole, 'authorization_check_failed');
    }
  }

  public protectInvoke<Arguments extends unknown[], Result>(
    channel: IpcCapabilityChannel,
    handler: InvokeHandler<Arguments, Result>,
  ): InvokeHandler<Arguments, Result> {
    return (event, ...args) => {
      if (!this.authorize(event, channel)) {
        throw new IpcPermissionError();
      }

      return handler(event, ...args);
    };
  }

  public protectEvent<Arguments extends unknown[]>(
    channel: IpcCapabilityChannel,
    handler: EventHandler<Arguments>,
  ): EventHandler<Arguments> {
    return (event, ...args) => {
      if (!this.authorize(event, channel)) {
        return;
      }

      handler(event, ...args);
    };
  }

  private deny(
    channel: string,
    expectedRole: RendererRole | 'unregistered',
    reason: string,
  ): false {
    this.logDenial({ channel, expectedRole, reason });
    return false;
  }
}
