const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  createReminderUpdateInput,
  getReminderDisplayStatus,
  groupRemindersForManager,
} = require('../dist/shared/reminderManager.js');

const createReminder = (id, overrides = {}) => ({
  id,
  title: `Reminder ${id}`,
  message: '',
  scheduledAt: '2030-01-01T12:00:00.000Z',
  completed: false,
  createdAt: '2030-01-01T10:00:00.000Z',
  updatedAt: '2030-01-01T10:00:00.000Z',
  ...overrides,
});

describe('reminder manager grouping', () => {
  test('sorts upcoming ascending and completed by completion time descending', () => {
    const reminders = [
      createReminder('completed-older', {
        completed: true,
        scheduledAt: '2030-01-01T08:00:00.000Z',
        updatedAt: '2030-01-01T09:00:00.000Z',
      }),
      createReminder('upcoming-later', {
        scheduledAt: '2030-01-01T14:00:00.000Z',
      }),
      createReminder('completed-newer', {
        completed: true,
        scheduledAt: '2030-01-01T07:00:00.000Z',
        updatedAt: '2030-01-01T11:00:00.000Z',
      }),
      createReminder('upcoming-sooner', {
        scheduledAt: '2030-01-01T13:00:00.000Z',
      }),
    ];

    const groups = groupRemindersForManager(reminders);

    assert.deepEqual(
      groups.upcoming.map(({ id }) => id),
      ['upcoming-sooner', 'upcoming-later'],
    );
    assert.deepEqual(
      groups.completed.map(({ id }) => id),
      ['completed-newer', 'completed-older'],
    );
    assert.deepEqual(
      groups.all.map(({ id }) => id),
      [
        'upcoming-sooner',
        'upcoming-later',
        'completed-newer',
        'completed-older',
      ],
    );
  });

  test('reports upcoming, overdue, and completed statuses', () => {
    const now = Date.parse('2030-01-01T12:00:00.000Z');

    assert.equal(
      getReminderDisplayStatus(
        createReminder('upcoming', {
          scheduledAt: '2030-01-01T12:01:00.000Z',
        }),
        now,
      ),
      'upcoming',
    );
    assert.equal(
      getReminderDisplayStatus(
        createReminder('overdue', {
          scheduledAt: '2030-01-01T11:59:00.000Z',
        }),
        now,
      ),
      'overdue',
    );
    assert.equal(
      getReminderDisplayStatus(
        createReminder('completed', { completed: true }),
        now,
      ),
      'completed',
    );
  });
});

describe('reminder manager edits', () => {
  test('does not update an unchanged reminder at the same local minute', () => {
    const reminder = createReminder('unchanged', {
      title: 'Review notes',
      message: 'Check migration details.',
      scheduledAt: '2030-01-01T12:30:45.000Z',
    });

    assert.equal(
      createReminderUpdateInput(reminder, {
        title: ' Review notes ',
        message: ' Check migration details. ',
        scheduledAt: '2030-01-01T12:30:00.000Z',
      }),
      null,
    );
  });

  test('creates a minimal patch for changed reminder fields', () => {
    const reminder = createReminder('changed', {
      title: 'Review notes',
      message: '',
      scheduledAt: '2030-01-01T12:30:00.000Z',
    });

    assert.deepEqual(
      createReminderUpdateInput(reminder, {
        title: 'Publish notes',
        message: 'Share with the team.',
        scheduledAt: '2030-01-01T12:35:00.000Z',
      }),
      {
        title: 'Publish notes',
        message: 'Share with the team.',
        scheduledAt: '2030-01-01T12:35:00.000Z',
      },
    );
  });
});
