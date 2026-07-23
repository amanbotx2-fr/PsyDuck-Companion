const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { describe, test } = require('node:test');

const {
  ReminderNotFoundError,
  ReminderService,
  ReminderValidationError,
} = require('../dist/main/ReminderService.js');
const { SettingsService } = require('../dist/main/SettingsService.js');
const {
  MAXIMUM_REMINDER_MESSAGE_LENGTH,
  MAXIMUM_REMINDER_TITLE_LENGTH,
} = require('../dist/shared/reminders.js');
const {
  toPreferencesSettings,
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
  general: {
    alwaysOnTop: false,
    launchAtStartup: true,
    eyeTracking: false,
  },
  water: {
    enabled: false,
    interval: 45,
  },
  ai: {
    enabled: false,
    provider: '',
    model: '',
    endpoint: 'http://localhost:11434',
  },
  credential: null,
});

const createTestContext = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'psyduck-reminders-'));
  const filePath = join(directory, 'settings.json');
  const settingsService = new SettingsService(
    filePath,
    unavailableCredentialManager,
  );
  await settingsService.load();

  return {
    directory,
    filePath,
    settingsService,
  };
};

describe('reminder settings migration', () => {
  test('adds an empty reminder collection without changing existing settings', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'psyduck-reminder-migration-'),
    );
    const filePath = join(directory, 'settings.json');
    const legacyDocument = createLegacySettingsDocument();

    try {
      await writeFile(filePath, JSON.stringify(legacyDocument), 'utf8');
      const settingsService = new SettingsService(
        filePath,
        unavailableCredentialManager,
      );
      const settings = await settingsService.load();
      const persistedDocument = JSON.parse(
        await readFile(filePath, 'utf8'),
      );

      assert.deepEqual(settings.reminders, []);
      assert.deepEqual(persistedDocument.reminders, []);
      assert.equal(settings.userName, legacyDocument.userName);
      assert.equal(persistedDocument.userName, legacyDocument.userName);
      assert.deepEqual(persistedDocument.general, legacyDocument.general);
      assert.deepEqual(persistedDocument.water, legacyDocument.water);
      assert.deepEqual(persistedDocument.ai, legacyDocument.ai);
      assert.equal(persistedDocument.credential, null);

      const runtimeSettings = toRuntimeSettings(settings);
      const preferencesSettings = toPreferencesSettings(settings);
      assert.equal(Object.hasOwn(runtimeSettings, 'reminders'), false);
      assert.equal(Object.hasOwn(preferencesSettings, 'reminders'), false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('migrates existing one-time reminders without losing data', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'psyduck-recurrence-migration-'),
    );
    const filePath = join(directory, 'settings.json');
    const legacyReminder = {
      id: 'legacy-reminder',
      title: 'Keep this reminder',
      message: 'Existing data must survive.',
      scheduledAt: '2030-02-01T09:30:00.000Z',
      completed: false,
      createdAt: '2030-01-01T09:00:00.000Z',
      updatedAt: '2030-01-01T09:00:00.000Z',
    };
    const legacyDocument = {
      ...createLegacySettingsDocument(),
      reminders: [legacyReminder],
    };

    try {
      await writeFile(filePath, JSON.stringify(legacyDocument), 'utf8');
      const settingsService = new SettingsService(
        filePath,
        unavailableCredentialManager,
      );
      const settings = await settingsService.load();
      const persistedDocument = JSON.parse(
        await readFile(filePath, 'utf8'),
      );
      const migratedReminder = settings.reminders[0];

      assert.equal(migratedReminder.id, legacyReminder.id);
      assert.equal(migratedReminder.title, legacyReminder.title);
      assert.deepEqual(migratedReminder.recurrence, { type: 'none' });
      assert.equal(migratedReminder.lastTriggeredAt, null);
      assert.equal(
        migratedReminder.nextOccurrence,
        legacyReminder.scheduledAt,
      );
      assert.deepEqual(
        persistedDocument.reminders[0],
        migratedReminder,
      );
      assert.deepEqual(persistedDocument.general, legacyDocument.general);
      assert.deepEqual(persistedDocument.water, legacyDocument.water);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('ReminderService CRUD', () => {
  test('normalizes, sorts, updates, completes, deletes, and restores reminders', async () => {
    const context = await createTestContext();
    let now = Date.parse('2030-01-01T00:00:00.000Z');
    const ids = ['later-reminder', 'earlier-reminder'];
    const reminderService = new ReminderService(context.settingsService, {
      createId: () => ids.shift(),
      now: () => new Date(now),
    });
    let changeCount = 0;
    const unsubscribe = reminderService.subscribe(() => {
      changeCount += 1;
    });

    try {
      const later = await reminderService.createReminder({
        title: '  Review release notes  ',
        message: '  Before publishing  ',
        scheduledAt: '2030-01-03T05:30:00+05:30',
      });
      const earlier = await reminderService.createReminder({
        title: 'Stand up',
        scheduledAt: '2030-01-02T00:00:00Z',
      });

      assert.equal(later.title, 'Review release notes');
      assert.equal(later.message, 'Before publishing');
      assert.equal(later.scheduledAt, '2030-01-03T00:00:00.000Z');
      assert.deepEqual(later.recurrence, { type: 'none' });
      assert.equal(later.lastTriggeredAt, null);
      assert.equal(
        later.nextOccurrence,
        '2030-01-03T00:00:00.000Z',
      );
      assert.equal(earlier.message, '');
      assert.deepEqual(
        reminderService.listReminders().map(({ id }) => id),
        ['earlier-reminder', 'later-reminder'],
      );

      later.title = 'Mutated outside the service';
      assert.equal(
        reminderService.getReminder('later-reminder').title,
        'Review release notes',
      );

      now = Date.parse('2030-01-01T01:00:00.000Z');
      const updated = await reminderService.updateReminder(
        'earlier-reminder',
        {
          title: '  Daily stand-up  ',
          message: '  Team sync  ',
          scheduledAt: '2030-01-04T00:00:00.000Z',
        },
      );
      assert.equal(updated.title, 'Daily stand-up');
      assert.equal(updated.message, 'Team sync');
      assert.equal(updated.createdAt, '2030-01-01T00:00:00.000Z');
      assert.equal(updated.updatedAt, '2030-01-01T01:00:00.000Z');
      assert.deepEqual(
        reminderService.listReminders().map(({ id }) => id),
        ['later-reminder', 'earlier-reminder'],
      );

      const completed = await reminderService.markCompleted(
        'earlier-reminder',
      );
      assert.equal(completed.completed, true);
      assert.equal(completed.nextOccurrence, null);
      assert.equal(
        completed.lastTriggeredAt,
        '2030-01-01T01:00:00.000Z',
      );
      assert.equal(
        (await reminderService.markCompleted('earlier-reminder')).updatedAt,
        completed.updatedAt,
      );
      assert.equal(await reminderService.deleteReminder('later-reminder'), true);
      assert.equal(await reminderService.deleteReminder('missing'), false);
      assert.equal(reminderService.getReminder('missing'), null);

      const restoredSettingsService = new SettingsService(
        context.filePath,
        unavailableCredentialManager,
      );
      await restoredSettingsService.load();
      const restoredReminderService = new ReminderService(
        restoredSettingsService,
      );
      const restoredReminders = restoredReminderService.listReminders();

      assert.equal(restoredReminders.length, 1);
      assert.equal(restoredReminders[0].id, 'earlier-reminder');
      assert.equal(restoredReminders[0].completed, true);
      assert.equal(restoredReminders[0].title, 'Daily stand-up');
      assert.equal(changeCount, 5);
    } finally {
      unsubscribe();
      await rm(context.directory, { recursive: true, force: true });
    }
  });

  test('advances recurring reminders without changing their IDs', async () => {
    const context = await createTestContext();
    let now = Date.parse('2030-01-01T08:00:00.000Z');
    const reminderService = new ReminderService(context.settingsService, {
      createId: () => 'recurring-reminder',
      now: () => new Date(now),
    });

    try {
      const reminder = await reminderService.createReminder({
        title: 'Daily review',
        scheduledAt: '2030-01-02T08:00:00.000Z',
        recurrence: { type: 'daily' },
      });

      now = Date.parse('2030-01-02T08:00:00.000Z');
      const advanced = await reminderService.markCompleted(reminder.id);

      assert.equal(advanced.id, reminder.id);
      assert.equal(advanced.completed, false);
      assert.equal(
        advanced.lastTriggeredAt,
        '2030-01-02T08:00:00.000Z',
      );
      assert.equal(
        advanced.nextOccurrence,
        '2030-01-03T08:00:00.000Z',
      );
      assert.equal(
        advanced.scheduledAt,
        '2030-01-02T08:00:00.000Z',
      );

      const edited = await reminderService.updateReminder(reminder.id, {
        recurrence: {
          type: 'interval',
          unit: 'hours',
          value: 3,
        },
      });

      assert.deepEqual(edited.recurrence, {
        type: 'interval',
        unit: 'hours',
        value: 3,
      });
      assert.equal(
        edited.nextOccurrence,
        '2030-01-03T08:00:00.000Z',
      );

      now = Date.parse('2030-01-03T08:00:00.000Z');
      const customAdvanced = await reminderService.markCompleted(
        reminder.id,
      );
      assert.equal(
        customAdvanced.nextOccurrence,
        '2030-01-03T11:00:00.000Z',
      );
      assert.equal(
        reminderService.listReminders().filter(
          ({ id }) => id === reminder.id,
        ).length,
        1,
      );
    } finally {
      await rm(context.directory, { recursive: true, force: true });
    }
  });

  test('serializes concurrent mutations so reminders cannot overwrite each other', async () => {
    const context = await createTestContext();
    const ids = ['first', 'second', 'third'];
    const reminderService = new ReminderService(context.settingsService, {
      createId: () => ids.shift(),
      now: () => new Date('2030-01-01T00:00:00.000Z'),
    });

    try {
      await Promise.all([
        reminderService.createReminder({
          title: 'Third',
          scheduledAt: '2030-01-03T00:00:00Z',
        }),
        reminderService.createReminder({
          title: 'First',
          scheduledAt: '2030-01-01T01:00:00Z',
        }),
        reminderService.createReminder({
          title: 'Second',
          scheduledAt: '2030-01-02T00:00:00Z',
        }),
      ]);

      assert.deepEqual(
        reminderService.listReminders().map(({ title }) => title),
        ['First', 'Second', 'Third'],
      );
      assert.equal(context.settingsService.get().reminders.length, 3);
    } finally {
      await rm(context.directory, { recursive: true, force: true });
    }
  });
});

describe('ReminderService validation', () => {
  test('rejects malformed, oversized, and past reminder data before persistence', async () => {
    const context = await createTestContext();
    const reminderService = new ReminderService(context.settingsService, {
      createId: () => 'valid-id',
      now: () => new Date('2030-01-01T00:00:00.000Z'),
    });
    const validInput = {
      title: 'Valid reminder',
      scheduledAt: '2030-01-02T00:00:00Z',
    };

    const rejectsField = async (operation, field) => {
      await assert.rejects(operation, (error) => {
        assert.ok(error instanceof ReminderValidationError);
        assert.equal(error.field, field);
        return true;
      });
    };

    try {
      await rejectsField(
        () =>
          reminderService.createReminder({
            ...validInput,
            title: '   ',
          }),
        'title',
      );
      await rejectsField(
        () =>
          reminderService.createReminder({
            ...validInput,
            title: 'x'.repeat(MAXIMUM_REMINDER_TITLE_LENGTH + 1),
          }),
        'title',
      );
      await rejectsField(
        () =>
          reminderService.createReminder({
            ...validInput,
            message: 'x'.repeat(MAXIMUM_REMINDER_MESSAGE_LENGTH + 1),
          }),
        'message',
      );
      await rejectsField(
        () =>
          reminderService.createReminder({
            ...validInput,
            scheduledAt: '2030-01-02',
          }),
        'scheduledAt',
      );
      await rejectsField(
        () =>
          reminderService.createReminder({
            ...validInput,
            recurrence: {
              type: 'interval',
              unit: 'minutes',
              value: 0,
            },
          }),
        'recurrence',
      );
      await rejectsField(
        () =>
          reminderService.createReminder({
            ...validInput,
            recurrence: {
              type: 'interval',
              unit: 'weeks',
              value: 2,
            },
          }),
        'recurrence',
      );
      await rejectsField(
        () =>
          reminderService.createReminder({
            ...validInput,
            recurrence: {
              type: 'interval',
              unit: 'hours',
            },
          }),
        'recurrence',
      );
      await rejectsField(
        () =>
          reminderService.createReminder({
            ...validInput,
            scheduledAt: '2030-02-30T00:00:00Z',
          }),
        'scheduledAt',
      );
      await rejectsField(
        () =>
          reminderService.createReminder({
            ...validInput,
            scheduledAt: '2029-12-31T23:59:59.999Z',
          }),
        'scheduledAt',
      );
      await rejectsField(
        () =>
          reminderService.createReminder({
            ...validInput,
            completed: false,
          }),
        'reminder',
      );

      const reminder = await reminderService.createReminder(validInput);
      await rejectsField(
        () => reminderService.updateReminder(reminder.id, {}),
        'reminder',
      );
      await rejectsField(
        () =>
          reminderService.updateReminder(reminder.id, {
            completed: true,
          }),
        'reminder',
      );
      await rejectsField(
        () =>
          reminderService.updateReminder(reminder.id, {
            scheduledAt: '2029-01-01T00:00:00Z',
          }),
        'scheduledAt',
      );
      assert.throws(
        () => reminderService.getReminder(' invalid-id '),
        (error) => {
          assert.ok(error instanceof ReminderValidationError);
          assert.equal(error.field, 'id');
          return true;
        },
      );
      await assert.rejects(
        () => reminderService.markCompleted('missing'),
        ReminderNotFoundError,
      );

      assert.equal(context.settingsService.get().reminders.length, 1);
    } finally {
      await rm(context.directory, { recursive: true, force: true });
    }
  });
});
