export const PROTECTED_CREDENTIAL_VERSION = 1 as const;

const MAXIMUM_CIPHERTEXT_LENGTH = 64 * 1024;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export interface SafeStorageAdapter {
  readonly isEncryptionAvailable: () => boolean;
  readonly encryptString: (plaintext: string) => Buffer;
  readonly decryptString: (encrypted: Buffer) => string;
  readonly getSelectedStorageBackend?: () => string;
}

export interface ProtectedCredential {
  readonly version: typeof PROTECTED_CREDENTIAL_VERSION;
  readonly ciphertext: string;
}

export type CredentialStorageErrorCode =
  | 'unavailable'
  | 'encryption_failed'
  | 'decryption_failed'
  | 'invalid_payload';

export class CredentialStorageError extends Error {
  public readonly code: CredentialStorageErrorCode;

  public constructor(
    code: CredentialStorageErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CredentialStorageError';
    this.code = code;
  }
}

const decodeCiphertext = (ciphertext: string): Buffer | null => {
  if (
    ciphertext.length === 0 ||
    ciphertext.length > MAXIMUM_CIPHERTEXT_LENGTH ||
    !BASE64_PATTERN.test(ciphertext)
  ) {
    return null;
  }

  const decoded = Buffer.from(ciphertext, 'base64');

  return decoded.length > 0 && decoded.toString('base64') === ciphertext
    ? decoded
    : null;
};

export const parseProtectedCredential = (
  value: unknown,
): ProtectedCredential | null => {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    Object.keys(record).length !== 2 ||
    record.version !== PROTECTED_CREDENTIAL_VERSION ||
    typeof record.ciphertext !== 'string' ||
    decodeCiphertext(record.ciphertext) === null
  ) {
    return null;
  }

  return {
    version: PROTECTED_CREDENTIAL_VERSION,
    ciphertext: record.ciphertext,
  };
};

export class CredentialManager {
  private readonly safeStorage: SafeStorageAdapter;
  private readonly platform: NodeJS.Platform;

  public constructor(
    safeStorage: SafeStorageAdapter,
    platform: NodeJS.Platform = process.platform,
  ) {
    this.safeStorage = safeStorage;
    this.platform = platform;
  }

  public isEncryptionAvailable(): boolean {
    try {
      if (!this.safeStorage.isEncryptionAvailable()) {
        return false;
      }

      // Electron can fall back to reversible "basic_text" storage on Linux.
      // Treat it as unavailable rather than claiming credentials are protected.
      return !(
        this.platform === 'linux' &&
        this.safeStorage.getSelectedStorageBackend?.() === 'basic_text'
      );
    } catch {
      return false;
    }
  }

  public encrypt(apiKey: string): ProtectedCredential {
    if (!this.isEncryptionAvailable()) {
      throw new CredentialStorageError(
        'unavailable',
        'Operating-system credential encryption is unavailable.',
      );
    }

    try {
      const encrypted = this.safeStorage.encryptString(apiKey);

      if (encrypted.length === 0) {
        throw new Error('safeStorage returned an empty encrypted value.');
      }

      // Verify the protected value before the caller atomically removes a
      // legacy plaintext credential. A failed round trip must never migrate.
      if (this.safeStorage.decryptString(encrypted) !== apiKey) {
        throw new Error('safeStorage credential verification failed.');
      }

      return {
        version: PROTECTED_CREDENTIAL_VERSION,
        ciphertext: encrypted.toString('base64'),
      };
    } catch (error) {
      throw new CredentialStorageError(
        'encryption_failed',
        'The API credential could not be encrypted.',
        { cause: error },
      );
    }
  }

  public decrypt(credential: ProtectedCredential): string {
    if (!this.isEncryptionAvailable()) {
      throw new CredentialStorageError(
        'unavailable',
        'Operating-system credential decryption is unavailable.',
      );
    }

    const encrypted = decodeCiphertext(credential.ciphertext);

    if (encrypted === null) {
      throw new CredentialStorageError(
        'invalid_payload',
        'The stored API credential is malformed.',
      );
    }

    try {
      return this.safeStorage.decryptString(encrypted);
    } catch (error) {
      throw new CredentialStorageError(
        'decryption_failed',
        'The stored API credential could not be decrypted.',
        { cause: error },
      );
    }
  }
}
