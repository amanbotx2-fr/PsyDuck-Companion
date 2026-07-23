const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  DEFAULT_REMINDER_LEAD_TIME_MS,
  REMINDER_TIME_STEP_MINUTES,
  createDefaultReminderLocalSchedule,
  parseReminderLocalSchedule,
} = require('../dist/shared/reminderDraft.js');

describe('reminder creation draft', () => {
  test('defaults to a future local time on a five-minute boundary', () => {
    const now = new Date(2030, 4, 17, 10, 32, 45, 500).getTime();
    const schedule = createDefaultReminderLocalSchedule(now);
    const scheduledAt = parseReminderLocalSchedule(
      schedule.date,
      schedule.time,
    );

    assert.notEqual(scheduledAt, null);
    const scheduledTimestamp = Date.parse(scheduledAt);
    assert.ok(
      scheduledTimestamp - now >= DEFAULT_REMINDER_LEAD_TIME_MS,
    );
    assert.ok(
      scheduledTimestamp - now <
        DEFAULT_REMINDER_LEAD_TIME_MS +
          REMINDER_TIME_STEP_MINUTES * 60 * 1_000,
    );
    const scheduledDate = new Date(scheduledTimestamp);
    assert.equal(
      scheduledDate.getMinutes() % REMINDER_TIME_STEP_MINUTES,
      0,
    );
    assert.equal(scheduledDate.getSeconds(), 0);
    assert.equal(scheduledDate.getMilliseconds(), 0);
  });

  test('converts valid local date and time fields to an ISO datetime', () => {
    const scheduledAt = parseReminderLocalSchedule(
      '2030-06-15',
      '14:35',
    );

    assert.notEqual(scheduledAt, null);
    const scheduledDate = new Date(scheduledAt);
    assert.equal(scheduledDate.getFullYear(), 2030);
    assert.equal(scheduledDate.getMonth(), 5);
    assert.equal(scheduledDate.getDate(), 15);
    assert.equal(scheduledDate.getHours(), 14);
    assert.equal(scheduledDate.getMinutes(), 35);
  });

  test('rejects empty, malformed, and impossible local schedules', () => {
    assert.equal(parseReminderLocalSchedule('', '14:35'), null);
    assert.equal(parseReminderLocalSchedule('2030-06-15', ''), null);
    assert.equal(
      parseReminderLocalSchedule('2030-6-15', '14:35'),
      null,
    );
    assert.equal(
      parseReminderLocalSchedule('2030-02-30', '14:35'),
      null,
    );
    assert.equal(
      parseReminderLocalSchedule('2030-06-15', '24:00'),
      null,
    );
    assert.equal(
      parseReminderLocalSchedule('2030-06-15', '14:60'),
      null,
    );
  });
});
