import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  cloneSettings,
  createDefaultSettings,
  mergeSettings,
  parseAiConfigurationUpdate,
  parseSettingsPatch,
  type AiConfigurationUpdate,
  type AppSettings,
  type SettingsPatch,
} from '../shared/settings';
import {
  CredentialManager,
  CredentialStorageError,
  parseProtectedCredential,
  type ProtectedCredential,
} from './CredentialManager';

type SettingsListener = (settings: AppSettings) => void;

interface ParsedSettingsDocument {
  readonly legacyApiKey: string | null;
  readonly protectedCredential: ProtectedCredential | null;
  readonly requiresRewrite: boolean;
  readonly settings: AppSettings;
}

const ROOT_KEYS = [
  'userName',
  'stickyMessage',
  'reminders',
  'general',
  'water',
  'ai',
  'credential',
] as const;
const REQUIRED_ROOT_KEYS = ['general', 'water', 'ai'] as const;
const GENERAL_KEYS = [
  'alwaysOnTop',
  'launchAtStartup',
  'eyeTracking',
] as const;
const WATER_KEYS = ['enabled', 'interval'] as const;
const STORED_AI_KEYS = [
  'enabled',
  'provider',
  'model',
  'endpoint',
  'apiKey',
] as const;
const REQUIRED_AI_KEYS = ['enabled', 'provider'] as const;

const isFileNotFoundError = (error: unknown): boolean =>
  error instanceof Error &&
  'code' in error &&
  (error as Error & { readonly code?: string }).code === 'ENOENT';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean => Object.keys(value).every((key) => allowedKeys.includes(key));

const hasEveryKey = (
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
): boolean => requiredKeys.every((key) => Object.hasOwn(value, key));

const applyCredentialStatus = (
  settings: AppSettings,
  apiKeyConfigured: boolean,
): AppSettings => ({
  ...settings,
  ai: {
    ...settings.ai,
    apiKeyConfigured,
  },
});

const serializeSettings = (
  settings: AppSettings,
  protectedCredential: ProtectedCredential | null,
  legacyApiKey: string | null,
): Record<string, unknown> => ({
  userName: settings.userName,
  stickyMessage: settings.stickyMessage,
  reminders: settings.reminders.map((reminder) => ({ ...reminder })),
  general: { ...settings.general },
  water: { ...settings.water },
  ai: {
    enabled: settings.ai.enabled,
    provider: settings.ai.provider,
    model: settings.ai.model,
    endpoint: settings.ai.endpoint,
    ...(legacyApiKey === null ? {} : { apiKey: legacyApiKey }),
  },
  credential: protectedCredential,
});

const parseSettingsDocument = (
  value: unknown,
): ParsedSettingsDocument | null => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ROOT_KEYS) ||
    !hasEveryKey(value, REQUIRED_ROOT_KEYS) ||
    !isRecord(value.general) ||
    !hasOnlyKeys(value.general, GENERAL_KEYS) ||
    !hasEveryKey(value.general, GENERAL_KEYS) ||
    !isRecord(value.water) ||
    !hasOnlyKeys(value.water, WATER_KEYS) ||
    !hasEveryKey(value.water, WATER_KEYS) ||
    !isRecord(value.ai) ||
    !hasOnlyKeys(value.ai, STORED_AI_KEYS) ||
    !hasEveryKey(value.ai, REQUIRED_AI_KEYS)
  ) {
    return null;
  }

  const aiConfiguration = parseAiConfigurationUpdate(value.ai);

  if (aiConfiguration === null) {
    return null;
  }

  const { apiKey, ...aiPatch } = aiConfiguration;
  const patch = parseSettingsPatch({
    ...(value.userName === undefined
      ? {}
      : { userName: value.userName }),
    ...(value.stickyMessage === undefined
      ? {}
      : { stickyMessage: value.stickyMessage }),
    ...(value.reminders === undefined
      ? {}
      : { reminders: value.reminders }),
    general: value.general,
    water: value.water,
    ai: aiPatch,
  });

  if (patch === null) {
    return null;
  }

  let protectedCredential: ProtectedCredential | null = null;

  if (value.credential !== undefined && value.credential !== null) {
    protectedCredential = parseProtectedCredential(value.credential);

    if (protectedCredential === null) {
      throw new CredentialStorageError(
        'invalid_payload',
        'The protected credential record in settings.json is malformed.',
      );
    }
  }

  const legacyApiKey = apiKey ?? null;
  const settings = applyCredentialStatus(
    mergeSettings(createDefaultSettings(), patch),
    protectedCredential !== null || (legacyApiKey?.trim().length ?? 0) > 0,
  );
  const canonicalDocument = serializeSettings(
    settings,
    protectedCredential,
    legacyApiKey,
  );

  return {
    legacyApiKey,
    protectedCredential,
    requiresRewrite:
      JSON.stringify(value) !== JSON.stringify(canonicalDocument),
    settings,
  };
};

export class SettingsService {
  private readonly credentialManager: CredentialManager;
  private readonly filePath: string;
  private readonly listeners = new Set<SettingsListener>();
  private settings = createDefaultSettings();
  private protectedCredential: ProtectedCredential | null = null;
  private legacyApiKey: string | null = null;
  private operationQueue: Promise<void> = Promise.resolve();

  public constructor(
    filePath: string,
    credentialManager: CredentialManager,
  ) {
    this.filePath = filePath;
    this.credentialManager = credentialManager;
  }

  public async load(): Promise<AppSettings> {
    try {
      const serializedSettings = await readFile(this.filePath, 'utf8');
      const parsedValue: unknown = JSON.parse(serializedSettings);
      const parsedDocument = parseSettingsDocument(parsedValue);

      if (parsedDocument === null) {
        await this.recoverInvalidFile();
      } else {
        this.settings = parsedDocument.settings;
        this.protectedCredential = parsedDocument.protectedCredential;
        this.legacyApiKey = parsedDocument.legacyApiKey;
        await this.migrateLegacyCredential(parsedDocument.requiresRewrite);
      }
    } catch (error) {
      if (isFileNotFoundError(error)) {
        this.resetToDefaults();
        await this.writeSnapshot(
          this.settings,
          this.protectedCredential,
          this.legacyApiKey,
        );
      } else if (error instanceof SyntaxError) {
        await this.recoverInvalidFile();
      } else {
        throw error;
      }
    }

    return this.get();
  }

  public get(): AppSettings {
    return cloneSettings(this.settings);
  }

  public getApiKey(): string {
    if ((this.legacyApiKey?.trim().length ?? 0) > 0) {
      return this.legacyApiKey ?? '';
    }

    if (this.protectedCredential === null) {
      return '';
    }

    return this.credentialManager.decrypt(this.protectedCredential);
  }

  public save(): Promise<void> {
    return this.enqueueOperation(() =>
      this.writeSnapshot(
        this.settings,
        this.protectedCredential,
        this.legacyApiKey,
      ),
    );
  }

  public update(patch: SettingsPatch): Promise<AppSettings> {
    return this.enqueueOperation(async () => {
      const nextSettings = applyCredentialStatus(
        mergeSettings(this.settings, patch),
        this.hasConfiguredApiKey(),
      );

      if (JSON.stringify(this.settings) === JSON.stringify(nextSettings)) {
        return this.get();
      }

      await this.writeSnapshot(
        nextSettings,
        this.protectedCredential,
        this.legacyApiKey,
      );
      this.settings = nextSettings;
      this.notifyListeners();
      return this.get();
    });
  }

  public updateAiConfiguration(
    configuration: AiConfigurationUpdate,
  ): Promise<AppSettings> {
    return this.enqueueOperation(async () => {
      const { apiKey, ...aiPatch } = configuration;
      const nextCredential =
        apiKey === undefined
          ? this.protectedCredential
          : this.protectApiKey(apiKey);
      const nextLegacyApiKey =
        apiKey === undefined ? this.legacyApiKey : null;
      const nextSettings = applyCredentialStatus(
        mergeSettings(this.settings, {
          ai: aiPatch,
        }),
        nextCredential !== null ||
          (nextLegacyApiKey?.trim().length ?? 0) > 0,
      );

      if (
        JSON.stringify(this.settings) === JSON.stringify(nextSettings) &&
        JSON.stringify(this.protectedCredential) ===
          JSON.stringify(nextCredential) &&
        this.legacyApiKey === nextLegacyApiKey
      ) {
        return this.get();
      }

      // Settings and ciphertext share one atomic snapshot, so a failed write
      // cannot apply a provider change while losing its credential.
      await this.writeSnapshot(
        nextSettings,
        nextCredential,
        nextLegacyApiKey,
      );
      this.settings = nextSettings;
      this.protectedCredential = nextCredential;
      this.legacyApiKey = nextLegacyApiKey;
      this.notifyListeners();
      return this.get();
    });
  }

  public subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private hasConfiguredApiKey(): boolean {
    return (
      this.protectedCredential !== null ||
      (this.legacyApiKey?.trim().length ?? 0) > 0
    );
  }

  private protectApiKey(apiKey: string): ProtectedCredential | null {
    const normalizedApiKey = apiKey.trim();

    return normalizedApiKey.length === 0
      ? null
      : this.credentialManager.encrypt(normalizedApiKey);
  }

  private async migrateLegacyCredential(
    requiresRewrite: boolean,
  ): Promise<void> {
    if (this.legacyApiKey === null) {
      if (requiresRewrite) {
        await this.writeSnapshot(
          this.settings,
          this.protectedCredential,
          null,
        );
      }

      return;
    }

    if (this.legacyApiKey.trim().length === 0) {
      await this.commitCredentialMigration(this.protectedCredential);
      return;
    }

    if (!this.credentialManager.isEncryptionAvailable()) {
      console.warn(
        '[security] credential_migration_deferred: safeStorage is unavailable; the existing credential was preserved without modifying settings.json.',
      );
      return;
    }

    try {
      const protectedCredential = this.credentialManager.encrypt(
        this.legacyApiKey,
      );
      await this.commitCredentialMigration(protectedCredential);
      console.info(
        '[security] credential_migration_complete: plaintext API credential replaced with protected storage.',
      );
    } catch (error) {
      // Keep the original file and in-memory legacy value until a later retry.
      // The atomic writer removes plaintext only after encryption succeeds.
      console.error(
        '[security] credential_migration_failed: the existing credential was preserved.',
        error instanceof Error ? error.message : 'Unknown failure',
      );
    }
  }

  private async commitCredentialMigration(
    protectedCredential: ProtectedCredential | null,
  ): Promise<void> {
    const migratedSettings = applyCredentialStatus(
      this.settings,
      protectedCredential !== null,
    );

    await this.writeSnapshot(migratedSettings, protectedCredential, null);
    this.settings = migratedSettings;
    this.protectedCredential = protectedCredential;
    this.legacyApiKey = null;
  }

  private notifyListeners(): void {
    const snapshot = this.get();

    for (const listener of this.listeners) {
      try {
        listener(cloneSettings(snapshot));
      } catch (error) {
        console.error('[settings] listener_failed', error);
      }
    }
  }

  private enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async writeSnapshot(
    settings: AppSettings,
    protectedCredential: ProtectedCredential | null,
    legacyApiKey: string | null,
  ): Promise<void> {
    const directory = dirname(this.filePath);
    const temporaryPath = `${this.filePath}.tmp`;
    const document = serializeSettings(
      settings,
      protectedCredential,
      legacyApiKey,
    );
    const serializedSettings = `${JSON.stringify(document, null, 2)}\n`;

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

    this.resetToDefaults();
    await this.writeSnapshot(
      this.settings,
      this.protectedCredential,
      this.legacyApiKey,
    );
  }

  private resetToDefaults(): void {
    this.settings = createDefaultSettings();
    this.protectedCredential = null;
    this.legacyApiKey = null;
  }
}
