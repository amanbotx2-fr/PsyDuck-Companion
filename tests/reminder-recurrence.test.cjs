const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  calculateNextReminderOccurrence,
  formatReminderRecurrence,
  parseReminderRecurrence,
} = require('../dist/shared/reminderRecurrence.js');

const assertLocalTime = (date, hour, minute) => {
  assert.equal(date.getHours(), hour);
  assert.equal(date.getMinutes(), minute);
};

describe('reminder recurrence calculations', () => {
  test('advances hourly reminders by elapsed hours', () => {
    const occurrence = new Date(2030, 0, 1, 9, 15);
    const next = new Date(
      calculateNextReminderOccurrence(
        { type: 'hourly' },
        occurrence.toISOString(),
        occurrence.getTime(),
      ),
    );

    assert.equal(next.getTime() - occurrence.getTime(), 60 * 60 * 1_000);
    assertLocalTime(next, 10, 15);
  });

  test('advances daily reminders at the same local time', () => {
    const occurrence = new Date(2030, 2, 9, 9, 15);
    const next = new Date(
      calculateNextReminderOccurrence(
        { type: 'daily' },
        occurrence.toISOString(),
        occurrence.getTime(),
      ),
    );

    assert.equal(next.getDate(), occurrence.getDate() + 1);
    assertLocalTime(next, 9, 15);
  });

  test('advances weekly reminders by seven local calendar days', () => {
    const occurrence = new Date(2030, 4, 6, 14, 30);
    const next = new Date(
      calculateNextReminderOccurrence(
        { type: 'weekly' },
        occurrence.toISOString(),
        occurrence.getTime(),
      ),
    );

    assert.equal(next.getDate(), occurrence.getDate() + 7);
    assertLocalTime(next, 14, 30);
  });

  test('clamps monthly reminders and restores the anchor day', () => {
    const anchor = new Date(2030, 0, 31, 8, 45);
    const february = new Date(
      calculateNextReminderOccurrence(
        { type: 'monthly' },
        anchor.toISOString(),
        anchor.getTime(),
        anchor.toISOString(),
      ),
    );
    const march = new Date(
      calculateNextReminderOccurrence(
        { type: 'monthly' },
        february.toISOString(),
        february.getTime(),
        anchor.toISOString(),
      ),
    );

    assert.equal(february.getMonth(), 1);
    assert.equal(february.getDate(), 28);
    assertLocalTime(february, 8, 45);
    assert.equal(march.getMonth(), 2);
    assert.equal(march.getDate(), 31);
    assertLocalTime(march, 8, 45);
  });

  test('supports custom minute, hour, and local-day intervals', () => {
    const occurrence = new Date(2030, 5, 10, 11, 20);
    const nextMinutes = new Date(
      calculateNextReminderOccurrence(
        { type: 'interval', unit: 'minutes', value: 30 },
        occurrence.toISOString(),
        occurrence.getTime(),
      ),
    );
    const nextHours = new Date(
      calculateNextReminderOccurrence(
        { type: 'interval', unit: 'hours', value: 3 },
        occurrence.toISOString(),
        occurrence.getTime(),
      ),
    );
    const nextDays = new Date(
      calculateNextReminderOccurrence(
        { type: 'interval', unit: 'days', value: 3 },
        occurrence.toISOString(),
        occurrence.getTime(),
      ),
    );

    assert.equal(
      nextMinutes.getTime() - occurrence.getTime(),
      30 * 60 * 1_000,
    );
    assert.equal(
      nextHours.getTime() - occurrence.getTime(),
      3 * 60 * 60 * 1_000,
    );
    assert.equal(nextDays.getDate(), occurrence.getDate() + 3);
    assertLocalTime(nextDays, 11, 20);
  });

  test('skips missed fixed intervals without replaying each occurrence', () => {
    const occurrence = new Date(2030, 0, 1, 9, 0);
    const after = occurrence.getTime() + 3.5 * 60 * 60 * 1_000;
    const next = new Date(
      calculateNextReminderOccurrence(
        { type: 'hourly' },
        occurrence.toISOString(),
        after,
      ),
    );

    assert.equal(
      next.getTime() - occurrence.getTime(),
      4 * 60 * 60 * 1_000,
    );
  });
});

describe('reminder recurrence validation and labels', () => {
  test('rejects invalid custom intervals and malformed recurrence data', () => {
    assert.equal(
      parseReminderRecurrence({
        type: 'interval',
        unit: 'minutes',
        value: 0,
      }),
      null,
    );
    assert.equal(
      parseReminderRecurrence({
        type: 'interval',
        unit: 'hours',
        value: -2,
      }),
      null,
    );
    assert.equal(
      parseReminderRecurrence({
        type: 'interval',
        unit: 'days',
        value: 1.5,
      }),
      null,
    );
    assert.equal(
      parseReminderRecurrence({
        type: 'interval',
        unit: 'weeks',
        value: 2,
      }),
      null,
    );
    assert.equal(
      parseReminderRecurrence({
        type: 'interval',
        unit: 'minutes',
      }),
      null,
    );
    assert.equal(parseReminderRecurrence({ type: 'yearly' }), null);
    assert.throws(
      () =>
        calculateNextReminderOccurrence(
          { type: 'none' },
          new Date().toISOString(),
        ),
      /recurring reminder configuration/i,
    );
  });

  test('formats manager labels from structured recurrence values', () => {
    assert.equal(formatReminderRecurrence({ type: 'none' }), null);
    assert.equal(
      formatReminderRecurrence({ type: 'daily' }),
      'Repeats Daily',
    );
    assert.equal(
      formatReminderRecurrence({ type: 'weekly' }),
      'Repeats Weekly',
    );
    assert.equal(
      formatReminderRecurrence({
        type: 'interval',
        unit: 'hours',
        value: 3,
      }),
      'Every 3 Hours',
    );
    assert.equal(
      formatReminderRecurrence({
        type: 'interval',
        unit: 'minutes',
        value: 1,
      }),
      'Every 1 Minute',
    );
  });
});
