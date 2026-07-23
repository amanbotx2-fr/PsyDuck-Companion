const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { describe, test } = require('node:test');

const { SettingsService } = require('../dist/main/SettingsService.js');
const {
  MAXIMUM_STICKY_MESSAGE_LENGTH,
  createDefaultSettings,
  normalizeStickyMessage,
  parseSettings,
  parseSettingsPatch,
  toRuntimeSettings,
} = require('../dist/shared/settings.js');

const unavailableCredentialManager = {
  decrypt: () => '',
  encrypt: () => {
    throw new Error('Credential storage is unavailable in this test.');
  },
  isEncryptionAvailable: () => false,
};

const createLegacySettingsDocument = () => ({
  userName: 'Aman',
  reminders: [],
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
});

describe('sticky message settings', () => {
  test('normalizes valid messages and rejects invalid values', () => {
    const maximumLengthMessage = 'a'.repeat(
      MAXIMUM_STICKY_MESSAGE_LENGTH,
    );

    assert.equal(
      normalizeStickyMessage('  Review the release checklist.  '),
      'Review the release checklist.',
    );
    assert.equal(
      normalizeStickyMessage(maximumLengthMessage),
      maximumLengthMessage,
    );
    assert.equal(normalizeStickyMessage(''), null);
    assert.equal(normalizeStickyMessage('   \n  '), null);
    assert.equal(
      normalizeStickyMessage(
        'a'.repeat(MAXIMUM_STICKY_MESSAGE_LENGTH + 1),
      ),
      null,
    );
    assert.equal(normalizeStickyMessage(42), null);

    assert.deepEqual(
      parseSettingsPatch({
        stickyMessage: '  Review the release checklist.  ',
      }),
      {
        stickyMessage: 'Review the release checklist.',
      },
    );
    assert.deepEqual(parseSettingsPatch({ stickyMessage: null }), {
      stickyMessage: null,
    });
    assert.equal(parseSettingsPatch({ stickyMessage: '' }), null);
  });

  test('includes the message in runtime settings without exposing secrets', () => {
    const settings = createDefaultSettings();
    const runtimeSettings = toRuntimeSettings({
      ...settings,
      stickyMessage: 'Keep this visible.',
    });

    assert.equal(settings.stickyMessage, null);
    assert.equal(runtimeSettings.stickyMessage, 'Keep this visible.');
    assert.equal(Object.hasOwn(runtimeSettings, 'ai'), false);
    assert.equal(Object.hasOwn(runtimeSettings, 'reminders'), false);
    assert.deepEqual(parseSettings(settings), settings);
  });

  test('migrates, persists, broadcasts, restores, and clears one message', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'psyduck-sticky-message-'),
    );
    const filePath = join(directory, 'settings.json');
    const legacyDocument = createLegacySettingsDocument();

    try {
      await writeFile(filePath, JSON.stringify(legacyDocument), 'utf8');
      const settingsService = new SettingsService(
        filePath,
        unavailableCredentialManager,
      );
      const migratedSettings = await settingsService.load();
      const migratedDocument = JSON.parse(
        await readFile(filePath, 'utf8'),
      );
      const changes = [];
      const unsubscribe = settingsService.subscribe((settings) => {
        changes.push(settings.stickyMessage);
      });

      assert.equal(migratedSettings.stickyMessage, null);
      assert.equal(migratedDocument.stickyMessage, null);
      assert.equal(migratedDocument.userName, legacyDocument.userName);
      assert.deepEqual(
        migratedDocument.reminders,
        legacyDocument.reminders,
      );
      assert.deepEqual(
        migratedDocument.general,
        legacyDocument.general,
      );

      await settingsService.update({
        stickyMessage: 'Review the release checklist.',
      });

      const restoredService = new SettingsService(
        filePath,
        unavailableCredentialManager,
      );
      assert.equal(
        (await restoredService.load()).stickyMessage,
        'Review the release checklist.',
      );

      await settingsService.update({ stickyMessage: null });
      unsubscribe();

      const clearedService = new SettingsService(
        filePath,
        unavailableCredentialManager,
      );
      assert.equal((await clearedService.load()).stickyMessage, null);
      assert.deepEqual(changes, [
        'Review the release checklist.',
        null,
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
