const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  REMINDER_SNOOZE_DURATION_MS,
  createSnoozedReminderInput,
} = require('../dist/shared/reminders.js');

const REMINDER = {
  id: 'reminder-1',
  title: 'Review the release notes',
  message: 'Check the migration section.',
  scheduledAt: '2030-01-01T12:00:00.000Z',
  recurrence: { type: 'daily' },
  lastTriggeredAt: null,
  nextOccurrence: '2030-01-01T12:00:00.000Z',
  completed: false,
  createdAt: '2030-01-01T11:00:00.000Z',
  updatedAt: '2030-01-01T12:00:00.000Z',
};

describe('reminder widget snooze', () => {
  test('creates a new reminder exactly five minutes after snooze', () => {
    const now = Date.parse('2030-01-01T12:30:15.250Z');
    const input = createSnoozedReminderInput(REMINDER, now);

    assert.deepEqual(input, {
      title: REMINDER.title,
      message: REMINDER.message,
      scheduledAt: new Date(
        now + REMINDER_SNOOZE_DURATION_MS,
      ).toISOString(),
      recurrence: { type: 'none' },
    });
    assert.equal(
      Date.parse(input.scheduledAt) - now,
      5 * 60 * 1_000,
    );
    assert.deepEqual(REMINDER.recurrence, { type: 'daily' });
  });

  test('rejects an invalid snooze clock', () => {
    assert.throws(
      () => createSnoozedReminderInput(REMINDER, Number.NaN),
      /snooze clock must be valid/i,
    );
  });
});
