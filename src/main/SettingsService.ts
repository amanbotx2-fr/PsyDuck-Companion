import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  cloneSettings,
  createDefaultSettings,
  mergeSettings,
  parseSettings,
  type AppSettings,
  type SettingsPatch,
} from '../shared/settings';

type SettingsListener = (settings: AppSettings) => void;

const isFileNotFoundError = (error: unknown): boolean =>
  error instanceof Error &&
  'code' in error &&
  (error as Error & { readonly code?: string }).code === 'ENOENT';

export class SettingsService {
  private readonly filePath: string;
  private readonly listeners = new Set<SettingsListener>();
  private settings = createDefaultSettings();
  private operationQueue: Promise<void> = Promise.resolve();

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async load(): Promise<AppSettings> {
    try {
      const serializedSettings = await readFile(this.filePath, 'utf8');
      const parsedSettings: unknown = JSON.parse(serializedSettings);
      const settings = parseSettings(parsedSettings);

      if (settings === null) {
        await this.recoverInvalidFile();
      } else {
        this.settings = settings;
      }
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        if (error instanceof SyntaxError) {
          await this.recoverInvalidFile();
        } else {
          throw error;
        }
      } else {
        this.settings = createDefaultSettings();
        await this.writeSnapshot(this.settings);
      }
    }

    return this.get();
  }

  public get(): AppSettings {
    return cloneSettings(this.settings);
  }

  public save(): Promise<void> {
    return this.enqueueOperation(() => this.writeSnapshot(this.settings));
  }

  public update(patch: SettingsPatch): Promise<AppSettings> {
    return this.enqueueOperation(async () => {
      const previousSettings = this.settings;
      const nextSettings = mergeSettings(previousSettings, patch);

      if (
        JSON.stringify(previousSettings) === JSON.stringify(nextSettings)
      ) {
        return this.get();
      }

      this.settings = nextSettings;

      try {
        await this.writeSnapshot(nextSettings);
      } catch (error) {
        this.settings = previousSettings;
        throw error;
      }

      const snapshot = this.get();

      for (const listener of this.listeners) {
        try {
          listener(cloneSettings(snapshot));
        } catch (error) {
          console.error('[settings] listener_failed', error);
        }
      }

      return snapshot;
    });
  }

  public subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async writeSnapshot(settings: AppSettings): Promise<void> {
    const directory = dirname(this.filePath);
    const temporaryPath = `${this.filePath}.tmp`;
    const serializedSettings = `${JSON.stringify(settings, null, 2)}\n`;

    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, serializedSettings, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporaryPath, this.filePath);
  }

  private async recoverInvalidFile(): Promise<void> {
    const recoveryPath = `${this.filePath}.invalid-${Date.now()}`;

    try {
      await rename(this.filePath, recoveryPath);
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        throw error;
      }
    }

    this.settings = createDefaultSettings();
    await this.writeSnapshot(this.settings);
  }
}
