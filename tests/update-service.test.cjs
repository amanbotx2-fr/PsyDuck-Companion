const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { describe, test } = require('node:test');

const { SettingsService } = require('../dist/main/SettingsService.js');
const { UpdateService } = require('../dist/main/UpdateService.js');

const unavailableCredentialManager = {
  decrypt: () => '',
  encrypt: () => {
    throw new Error('Credential storage is unavailable in this test.');
  },
  isEncryptionAvailable: () => false,
};

class FakeUpdater extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  allowPrerelease = true;
  allowDowngrade = true;
  checkCalls = 0;
  downloadCalls = 0;
  checkImplementation = async () => null;
  downloadImplementation = async () => [];

  checkForUpdates() {
    this.checkCalls += 1;
    return this.checkImplementation();
  }

  downloadUpdate() {
    this.downloadCalls += 1;
    return this.downloadImplementation();
  }
}

const createService = (
  updater,
  { isPackaged = true, logs = [] } = {},
) =>
  new UpdateService(updater, {
    currentVersion: '1.2.3',
    isPackaged,
    logSecurityEvent: (operation, details) => {
      logs.push({ operation, details });
    },
  });

describe('UpdateService', () => {
  test('initializes safely and leaves automatic checks disabled', async () => {
    const updater = new FakeUpdater();
    const service = createService(updater);

    service.initialize();
    service.initialize();
    await service.checkAutomatically();

    assert.equal(updater.autoDownload, false);
    assert.equal(updater.autoInstallOnAppQuit, false);
    assert.equal(updater.allowPrerelease, false);
    assert.equal(updater.allowDowngrade, false);
    assert.equal(updater.checkCalls, 0);
    assert.deepEqual(service.getStatus(), {
      phase: 'idle',
      currentVersion: '1.2.3',
    });

    updater.checkImplementation = async () => {
      updater.emit('update-not-available', { version: '1.2.3' });
      return null;
    };
    service.setAutomaticChecksEnabled(true);
    const automaticResult = await service.checkAutomatically();

    assert.equal(updater.checkCalls, 1);
    assert.equal(automaticResult.phase, 'not-available');
    service.dispose();
  });

  test('checks manually and forwards availability events', async () => {
    const updater = new FakeUpdater();
    updater.checkImplementation = async () => {
      updater.emit('checking-for-update');
      updater.emit('update-available', { version: '1.3.0' });
      return null;
    };
    const service = createService(updater);
    const phases = [];
    service.subscribe((status) => phases.push(status.phase));

    const result = await service.checkForUpdates();

    assert.equal(updater.checkCalls, 1);
    assert.equal(updater.downloadCalls, 0);
    assert.deepEqual(result, {
      phase: 'available',
      currentVersion: '1.2.3',
      availableVersion: '1.3.0',
    });
    assert.deepEqual(phases, ['checking', 'checking', 'available']);
    service.dispose();
  });

  test('reports progress when an available update is downloaded explicitly', async () => {
    const updater = new FakeUpdater();
    updater.checkImplementation = async () => {
      updater.emit('update-available', { version: '1.3.0' });
      return null;
    };
    updater.downloadImplementation = async () => {
      updater.emit('download-progress', {
        percent: 42.4,
        transferred: 424,
        total: 1_000,
        bytesPerSecond: 212,
      });
      updater.emit('update-downloaded', { version: '1.3.0' });
      return ['/tmp/update'];
    };
    const service = createService(updater);
    const statuses = [];
    service.subscribe((status) => statuses.push(status));

    await service.checkForUpdates();
    const result = await service.downloadUpdate();

    assert.equal(updater.downloadCalls, 1);
    assert.equal(
      statuses.some(
        (status) =>
          status.phase === 'downloading' && status.percent === 42.4,
      ),
      true,
    );
    assert.deepEqual(result, {
      phase: 'downloaded',
      currentVersion: '1.2.3',
      availableVersion: '1.3.0',
    });
    service.dispose();
  });

  test('degrades gracefully when checks fail or run unpackaged', async () => {
    const logs = [];
    const updater = new FakeUpdater();
    updater.checkImplementation = async () => {
      const error = new Error('Offline');
      error.code = 'ENETUNREACH';
      throw error;
    };
    const service = createService(updater, { logs });

    const failed = await service.checkForUpdates();

    assert.equal(failed.phase, 'error');
    assert.equal(failed.message, 'Unable to check for updates.');
    assert.deepEqual(logs, [
      {
        operation: 'check_failed',
        details: {
          errorName: 'Error',
          errorCode: 'ENETUNREACH',
        },
      },
    ]);
    service.dispose();

    const developmentUpdater = new FakeUpdater();
    const developmentService = createService(developmentUpdater, {
      isPackaged: false,
      logs: [],
    });
    const developmentResult =
      await developmentService.checkForUpdates();

    assert.equal(developmentUpdater.checkCalls, 0);
    assert.equal(developmentResult.phase, 'error');
    assert.equal(
      developmentResult.message,
      'Update checks are available in packaged builds.',
    );
    developmentService.dispose();
  });

  test('coalesces concurrent update checks', async () => {
    const updater = new FakeUpdater();
    let resolveCheck;
    updater.checkImplementation = () =>
      new Promise((resolve) => {
        resolveCheck = resolve;
      });
    const service = createService(updater);

    const firstCheck = service.checkForUpdates();
    const secondCheck = service.checkForUpdates();
    await Promise.resolve();

    assert.equal(updater.checkCalls, 1);
    resolveCheck(null);
    const [firstResult, secondResult] = await Promise.all([
      firstCheck,
      secondCheck,
    ]);

    assert.equal(firstResult.phase, 'not-available');
    assert.deepEqual(secondResult, firstResult);
    service.dispose();
  });
});

describe('update settings migration', () => {
  test('adds disabled automatic updates without losing legacy settings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ducky-updates-'));
    const filePath = join(directory, 'settings.json');
    const legacyDocument = {
      userName: 'Aman',
      stickyMessage: 'Keep going',
      reminders: [],
      general: {
        alwaysOnTop: true,
        launchAtStartup: false,
        eyeTracking: true,
      },
      water: {
        enabled: true,
        interval: 45,
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
      const settings = await service.load();
      const migratedDocument = JSON.parse(
        await readFile(filePath, 'utf8'),
      );

      assert.deepEqual(settings.updates, { automatic: false });
      assert.deepEqual(migratedDocument.updates, {
        automatic: false,
      });
      assert.equal(migratedDocument.userName, 'Aman');
      assert.equal(migratedDocument.stickyMessage, 'Keep going');
      assert.equal(migratedDocument.water.interval, 45);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
