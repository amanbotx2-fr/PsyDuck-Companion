const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  DailyPlannerService,
  getDailyPlannerGreeting,
} = require('../dist/main/DailyPlannerService.js');

const localDate = (hour, minute = 0, day = 15) =>
  new Date(2030, 5, day, hour, minute, 0, 0);

const createReminder = (id, scheduledDate, overrides = {}) => ({
  id,
  title: `Reminder ${id}`,
  message: '',
  scheduledAt: scheduledDate.toISOString(),
  recurrence: { type: 'none' },
  lastTriggeredAt: null,
  nextOccurrence: scheduledDate.toISOString(),
  completed: false,
  createdAt: localDate(8, 0, 1).toISOString(),
  updatedAt: localDate(8, 0, 1).toISOString(),
  ...overrides,
});

const createPlanner = (reminders, now) =>
  new DailyPlannerService(
    {
      listReminders: () => reminders,
    },
    {
      now: () => new Date(now.getTime()),
    },
  );

describe('daily planner greeting', () => {
  test('selects morning, afternoon, and evening from local time', () => {
    assert.equal(
      getDailyPlannerGreeting('Aman', localDate(9)),
      'Good Morning, Aman.',
    );
    assert.equal(
      getDailyPlannerGreeting('Aman', localDate(14)),
      'Good Afternoon, Aman.',
    );
    assert.equal(
      getDailyPlannerGreeting('Aman', localDate(19)),
      'Good Evening, Aman.',
    );
  });

  test('uses the stored user name and normalizes surrounding whitespace', () => {
    const planner = createPlanner([], localDate(9));

    assert.equal(
      planner.getBriefing('  Aman  ').greeting,
      'Good Morning, Aman.',
    );
  });
});

describe('daily planner schedule', () => {
  test('returns the empty planner state when nothing is scheduled today', () => {
    const planner = createPlanner([], localDate(9));

    assert.deepEqual(planner.getBriefing('Friend').reminders, []);
  });

  test('includes one active reminder scheduled later today', () => {
    const reminder = createReminder('stand-up', localDate(10, 30), {
      title: 'Stand-up Meeting',
    });
    const planner = createPlanner([reminder], localDate(9));

    assert.deepEqual(planner.getBriefing('Aman').reminders, [
      {
        id: 'stand-up',
        title: 'Stand-up Meeting',
        scheduledAt: reminder.scheduledAt,
      },
    ]);
  });

  test('uses the effective occurrence of a recurring reminder', () => {
    const nextOccurrence = localDate(16);
    const reminder = createReminder(
      'daily-review',
      localDate(16, 0, 1),
      {
        title: 'Daily Review',
        recurrence: { type: 'daily' },
        lastTriggeredAt: localDate(16, 0, 14).toISOString(),
        nextOccurrence: nextOccurrence.toISOString(),
      },
    );
    const planner = createPlanner([reminder], localDate(9));

    assert.deepEqual(planner.getBriefing('Aman').reminders, [
      {
        id: 'daily-review',
        title: 'Daily Review',
        scheduledAt: nextOccurrence.toISOString(),
      },
    ]);
  });

  test('orders reminders chronologically regardless of source order', () => {
    const later = createReminder('gym', localDate(19), {
      title: 'Gym',
    });
    const earlier = createReminder('review', localDate(13), {
      title: 'Team Review',
    });
    const planner = createPlanner([later, earlier], localDate(9));

    assert.deepEqual(
      planner.getBriefing('Aman').reminders.map(({ id }) => id),
      ['review', 'gym'],
    );
  });

  test('excludes completed, expired, and non-today reminders', () => {
    const completed = createReminder('completed', localDate(14), {
      completed: true,
      nextOccurrence: null,
    });
    const expired = createReminder('expired', localDate(8, 59));
    const tomorrow = createReminder('tomorrow', localDate(9, 0, 16));
    const upcoming = createReminder('upcoming', localDate(11));
    const planner = createPlanner(
      [completed, expired, tomorrow, upcoming],
      localDate(9),
    );

    assert.deepEqual(
      planner.getBriefing('Aman').reminders.map(({ id }) => id),
      ['upcoming'],
    );
  });
});
