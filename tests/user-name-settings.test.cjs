const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { describe, test } = require('node:test');

const {
  DEFAULT_USER_NAME,
  MAXIMUM_USER_NAME_LENGTH,
  createDefaultSettings,
  normalizeUserName,
  parseSettingsPatch,
  toRuntimeSettings,
} = require('../dist/shared/settings.js');
const { SettingsService } = require('../dist/main/SettingsService.js');

const unavailableCredentialManager = {
  decrypt: () => '',
  encrypt: () => {
    throw new Error('Credential storage is unavailable in this test.');
  },
  isEncryptionAvailable: () => false,
};

describe('personal identity settings', () => {
  test('normalizes names and enforces the public validation contract', () => {
    assert.equal(normalizeUserName('  Aman  '), 'Aman');
    assert.equal(normalizeUserName(''), null);
    assert.equal(normalizeUserName('   '), null);
    assert.equal(
      normalizeUserName('a'.repeat(MAXIMUM_USER_NAME_LENGTH)),
      'a'.repeat(MAXIMUM_USER_NAME_LENGTH),
    );
    assert.equal(
      normalizeUserName('a'.repeat(MAXIMUM_USER_NAME_LENGTH + 1)),
      null,
    );
    assert.equal(parseSettingsPatch({ userName: '  Aman  ' }).userName, 'Aman');
    assert.equal(parseSettingsPatch({ userName: '   ' }), null);
  });

  test('defaults to Friend and includes the name in the runtime DTO', () => {
    const settings = createDefaultSettings();
    const runtimeSettings = toRuntimeSettings(settings);

    assert.equal(settings.userName, DEFAULT_USER_NAME);
    assert.equal(runtimeSettings.userName, DEFAULT_USER_NAME);
    assert.equal(Object.hasOwn(runtimeSettings, 'ai'), false);
  });

  test('migrates legacy settings and persists the selected name', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'psyduck-settings-'));
    const filePath = join(directory, 'settings.json');
    const legacyDocument = {
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

    try {
      await writeFile(filePath, JSON.stringify(legacyDocument), 'utf8');
      const service = new SettingsService(
        filePath,
        unavailableCredentialManager,
      );

      assert.equal((await service.load()).userName, DEFAULT_USER_NAME);
      const migratedDocument = JSON.parse(await readFile(filePath, 'utf8'));
      assert.equal(migratedDocument.userName, DEFAULT_USER_NAME);
      assert.deepEqual(migratedDocument.reminders, []);

      await service.update({ userName: 'Aman' });
      const restoredService = new SettingsService(
        filePath,
        unavailableCredentialManager,
      );
      assert.equal((await restoredService.load()).userName, 'Aman');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
