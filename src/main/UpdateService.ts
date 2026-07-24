import type { AppUpdater } from 'electron-updater';

import {
  cloneUpdateStatus,
  type UpdateStatus,
  type UpdateStatusListener,
} from '../shared/updates';

interface UpdateInfoLike {
  readonly version: string;
}

interface DownloadProgressLike {
  readonly bytesPerSecond: number;
  readonly percent: number;
  readonly total: number;
  readonly transferred: number;
}

export interface UpdateServiceOptions {
  readonly currentVersion: string;
  readonly isPackaged: boolean;
  readonly logSecurityEvent?: (
    operation: string,
    details: Readonly<Record<string, string>>,
  ) => void;
}

const clampNonNegativeNumber = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

const clampPercent = (value: number): number =>
  Math.min(100, clampNonNegativeNumber(value));

const normalizeVersion = (value: string): string => {
  const version = value.trim();
  return version.length > 0 && version.length <= 64
    ? version
    : 'Unknown';
};

const getErrorCode = (error: unknown): string => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code.slice(0, 80);
  }

  return 'unknown';
};

export class UpdateService {
  private readonly updater: AppUpdater;
  private readonly currentVersion: string;
  private readonly isPackaged: boolean;
  private readonly listeners = new Set<UpdateStatusListener>();
  private readonly logSecurityEvent: NonNullable<
    UpdateServiceOptions['logSecurityEvent']
  >;
  private status: UpdateStatus;
  private availableVersion: string | null = null;
  private automaticChecksEnabled = false;
  private initialized = false;
  private activeCheck: Promise<UpdateStatus> | null = null;
  private activeDownload: Promise<UpdateStatus> | null = null;

  public constructor(updater: AppUpdater, options: UpdateServiceOptions) {
    this.updater = updater;
    this.currentVersion = normalizeVersion(options.currentVersion);
    this.isPackaged = options.isPackaged;
    this.status = {
      phase: 'idle',
      currentVersion: this.currentVersion,
    };
    this.logSecurityEvent =
      options.logSecurityEvent ??
      ((operation, details) => {
        console.warn(`[updates] ${operation}`, details);
      });
  }

  public initialize(): void {
    if (this.initialized) {
      return;
    }

    // Update discovery and download are separate user-controlled operations.
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.allowPrerelease = false;
    this.updater.allowDowngrade = false;
    this.updater.on('checking-for-update', this.handleCheckingForUpdate);
    this.updater.on('update-available', this.handleUpdateAvailable);
    this.updater.on(
      'update-not-available',
      this.handleUpdateNotAvailable,
    );
    this.updater.on('download-progress', this.handleDownloadProgress);
    this.updater.on('update-downloaded', this.handleUpdateDownloaded);
    this.updater.on('error', this.handleUpdaterError);
    this.initialized = true;
  }

  public getStatus(): UpdateStatus {
    return cloneUpdateStatus(this.status);
  }

  public subscribe(listener: UpdateStatusListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public setAutomaticChecksEnabled(enabled: boolean): void {
    this.automaticChecksEnabled = enabled;
  }

  public checkAutomatically(): Promise<UpdateStatus> {
    return this.automaticChecksEnabled
      ? this.startCheck('automatic')
      : Promise.resolve(this.getStatus());
  }

  public checkForUpdates(): Promise<UpdateStatus> {
    return this.startCheck('manual');
  }

  public downloadUpdate(): Promise<UpdateStatus> {
    this.initialize();

    if (!this.isPackaged) {
      return Promise.resolve(
        this.reportError(
          'download_unavailable',
          undefined,
          'Update downloads are available in packaged builds.',
        ),
      );
    }

    if (this.availableVersion === null) {
      return Promise.resolve(
        this.reportError(
          'download_without_update',
          undefined,
          'No update is ready to download.',
        ),
      );
    }

    if (this.activeDownload !== null) {
      return this.activeDownload;
    }

    this.setStatus({
      phase: 'downloading',
      currentVersion: this.currentVersion,
      availableVersion: this.availableVersion,
      percent: 0,
      transferredBytes: 0,
      totalBytes: 0,
      bytesPerSecond: 0,
    });

    const operation = Promise.resolve()
      .then(() => this.updater.downloadUpdate())
      .then(() => this.getStatus())
      .catch((error: unknown) =>
        this.reportError(
          'download_failed',
          error,
          'The update could not be downloaded.',
        ),
      )
      .finally(() => {
        this.activeDownload = null;
      });

    this.activeDownload = operation;
    return operation;
  }

  public dispose(): void {
    if (!this.initialized) {
      return;
    }

    this.updater.removeListener(
      'checking-for-update',
      this.handleCheckingForUpdate,
    );
    this.updater.removeListener(
      'update-available',
      this.handleUpdateAvailable,
    );
    this.updater.removeListener(
      'update-not-available',
      this.handleUpdateNotAvailable,
    );
    this.updater.removeListener(
      'download-progress',
      this.handleDownloadProgress,
    );
    this.updater.removeListener(
      'update-downloaded',
      this.handleUpdateDownloaded,
    );
    this.updater.removeListener('error', this.handleUpdaterError);
    this.listeners.clear();
    this.initialized = false;
  }

  private startCheck(
    source: 'automatic' | 'manual',
  ): Promise<UpdateStatus> {
    this.initialize();

    if (!this.isPackaged) {
      if (source === 'automatic') {
        return Promise.resolve(this.getStatus());
      }

      return Promise.resolve(
        this.reportError(
          'check_unavailable',
          undefined,
          'Update checks are available in packaged builds.',
        ),
      );
    }

    if (this.activeCheck !== null) {
      return this.activeCheck;
    }

    this.setStatus({
      phase: 'checking',
      currentVersion: this.currentVersion,
    });

    const operation = Promise.resolve()
      .then(() => this.updater.checkForUpdates())
      .then(() => {
        if (this.status.phase === 'checking') {
          this.handleUpdateNotAvailable();
        }

        return this.getStatus();
      })
      .catch((error: unknown) => {
        if (this.status.phase === 'error') {
          return this.getStatus();
        }

        return this.reportError(
          'check_failed',
          error,
          'Unable to check for updates.',
        );
      })
      .finally(() => {
        this.activeCheck = null;
      });

    this.activeCheck = operation;
    return operation;
  }

  private readonly handleCheckingForUpdate = (): void => {
    this.setStatus({
      phase: 'checking',
      currentVersion: this.currentVersion,
    });
  };

  private readonly handleUpdateAvailable = (
    info: UpdateInfoLike,
  ): void => {
    this.availableVersion = normalizeVersion(info.version);
    this.setStatus({
      phase: 'available',
      currentVersion: this.currentVersion,
      availableVersion: this.availableVersion,
    });
  };

  private readonly handleUpdateNotAvailable = (): void => {
    this.availableVersion = null;
    this.setStatus({
      phase: 'not-available',
      currentVersion: this.currentVersion,
    });
  };

  private readonly handleDownloadProgress = (
    progress: DownloadProgressLike,
  ): void => {
    this.setStatus({
      phase: 'downloading',
      currentVersion: this.currentVersion,
      availableVersion: this.availableVersion,
      percent: clampPercent(progress.percent),
      transferredBytes: clampNonNegativeNumber(progress.transferred),
      totalBytes: clampNonNegativeNumber(progress.total),
      bytesPerSecond: clampNonNegativeNumber(progress.bytesPerSecond),
    });
  };

  private readonly handleUpdateDownloaded = (
    info: UpdateInfoLike,
  ): void => {
    this.availableVersion = normalizeVersion(info.version);
    this.setStatus({
      phase: 'downloaded',
      currentVersion: this.currentVersion,
      availableVersion: this.availableVersion,
    });
  };

  private readonly handleUpdaterError = (error: Error): void => {
    this.reportError(
      'updater_error',
      error,
      'Unable to complete the update operation.',
    );
  };

  private reportError(
    operation: string,
    error: unknown,
    message: string,
  ): UpdateStatus {
    this.logSecurityEvent(operation, {
      errorName: error instanceof Error ? error.name : 'UpdateError',
      errorCode: getErrorCode(error),
    });
    const status: UpdateStatus = {
      phase: 'error',
      currentVersion: this.currentVersion,
      message,
    };
    this.setStatus(status);
    return cloneUpdateStatus(status);
  }

  private setStatus(status: UpdateStatus): void {
    this.status = cloneUpdateStatus(status);

    for (const listener of this.listeners) {
      listener(cloneUpdateStatus(this.status));
    }
  }
}
