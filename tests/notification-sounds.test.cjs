const assert = require('node:assert/strict');
const {
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { describe, test } = require('node:test');

const { SettingsService } = require('../dist/main/SettingsService.js');
const {
  createDefaultSettings,
  parsePreferencesSettingsPatch,
  parseSettingsPatch,
  toPreferencesSettings,
  toRuntimeSettings,
} = require('../dist/shared/settings.js');
const {
  DEFAULT_NOTIFICATION_SOUND_SETTINGS,
  NOTIFICATION_SOUND_OPTIONS,
  parseNotificationSoundSettingsPatch,
} = require('../dist/shared/notificationSounds.js');

const unavailableCredentialManager = {
  decrypt: () => '',
  encrypt: () => {
    throw new Error('Credential storage is unavailable in this test.');
  },
  isEncryptionAvailable: () => false,
};

const legacySettingsDocument = {
  general: {
    alwaysOnTop: true,
    launchAtStartup: false,
    eyeTracking: true,
  },
  water: {
    enabled: true,
    interval: 30,
  },
  ai: {
    enabled: false,
    provider: '',
    model: '',
    endpoint: 'http://localhost:11434',
  },
  credential: null,
};

describe('notification sound settings', () => {
  test('uses safe defaults in runtime and Preferences settings', () => {
    const settings = createDefaultSettings();

    assert.deepEqual(
      settings.notificationSounds,
      DEFAULT_NOTIFICATION_SOUND_SETTINGS,
    );
    assert.deepEqual(
      toRuntimeSettings(settings).notificationSounds,
      DEFAULT_NOTIFICATION_SOUND_SETTINGS,
    );
    assert.deepEqual(
      toPreferencesSettings(settings).notificationSounds,
      DEFAULT_NOTIFICATION_SOUND_SETTINGS,
    );
  });

  test('accepts supported values and rejects malformed patches', () => {
    const validPatch = {
      enabled: false,
      sound: 'zen-chime',
      volume: 28,
    };

    assert.deepEqual(
      parseNotificationSoundSettingsPatch(validPatch),
      validPatch,
    );
    assert.deepEqual(parseSettingsPatch({
      notificationSounds: validPatch,
    }), {
      notificationSounds: validPatch,
    });
    assert.deepEqual(parsePreferencesSettingsPatch({
      notificationSounds: validPatch,
    }), {
      notificationSounds: validPatch,
    });

    for (const invalidPatch of [
      { sound: 'air-horn' },
      { volume: -1 },
      { volume: 101 },
      { volume: 27.5 },
      { enabled: 'yes' },
      { loop: true },
    ]) {
      assert.equal(
        parseNotificationSoundSettingsPatch(invalidPatch),
        null,
      );
    }
  });

  test('migrates legacy settings and restores persisted preferences', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'ducky-notification-sounds-'),
    );
    const filePath = join(directory, 'settings.json');

    try {
      await writeFile(
        filePath,
        JSON.stringify(legacySettingsDocument),
        'utf8',
      );
      const settingsService = new SettingsService(
        filePath,
        unavailableCredentialManager,
      );
      const migratedSettings = await settingsService.load();

      assert.deepEqual(
        migratedSettings.notificationSounds,
        DEFAULT_NOTIFICATION_SOUND_SETTINGS,
      );

      await settingsService.update({
        notificationSounds: {
          enabled: true,
          sound: 'digital-bell',
          volume: 42,
        },
      });

      const storedDocument = JSON.parse(await readFile(filePath, 'utf8'));
      assert.deepEqual(storedDocument.notificationSounds, {
        enabled: true,
        sound: 'digital-bell',
        volume: 42,
      });

      const restoredService = new SettingsService(
        filePath,
        unavailableCredentialManager,
      );
      assert.deepEqual(
        (await restoredService.load()).notificationSounds,
        storedDocument.notificationSounds,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('built-in notification sound pack', () => {
  test('contains one compact PCM WAV asset for every selectable sound', async () => {
    for (const sound of NOTIFICATION_SOUND_OPTIONS) {
      const filePath = join(
        __dirname,
        '..',
        'assets',
        'sounds',
        `${sound.id}.wav`,
      );
      const [contents, metadata] = await Promise.all([
        readFile(filePath),
        stat(filePath),
      ]);

      assert.equal(contents.subarray(0, 4).toString('ascii'), 'RIFF');
      assert.equal(contents.subarray(8, 12).toString('ascii'), 'WAVE');
      assert.ok(metadata.size > 44);
      assert.ok(metadata.size < 64 * 1024);
    }
  });
});
