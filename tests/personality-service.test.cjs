const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  DEFAULT_PERSONALITY_MESSAGES,
  PERSONALITY_EVENT_TYPE,
  PERSONALITY_TRIGGERS,
  PersonalityService,
} = require('../dist/personality/index.js');

describe('PersonalityService events', () => {
  test('emits the startup greeting once per service lifetime', () => {
    const service = new PersonalityService({ random: () => 0 });
    const events = [];
    service.subscribe((event) => events.push(event));

    const firstEvent = service.emitStartupGreeting();
    const duplicateEvent = service.emitStartupGreeting();

    assert.notEqual(firstEvent, null);
    assert.equal(duplicateEvent, null);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, PERSONALITY_EVENT_TYPE);
    assert.equal(
      events[0].trigger,
      PERSONALITY_TRIGGERS.applicationStartup,
    );
    assert.equal(events[0].sourceEventId, 'current-launch');
    assert.equal(
      DEFAULT_PERSONALITY_MESSAGES.welcome.includes(events[0].message),
      true,
    );
    assert.equal(Object.isFrozen(events[0]), true);
  });

  test('emits every contextual trigger once per source event', () => {
    const service = new PersonalityService({ random: () => 0 });
    const events = [];
    service.subscribe((event) => events.push(event));

    const pomodoroEvent = service.emitPomodoroCompletion('focus-1');
    const reminderEvent = service.emitReminderCompletion('reminder-1');
    const waterEvent =
      service.emitWaterReminderAcknowledgement('water-1');
    const stickyEvent =
      service.emitStickyMessageSaved('sticky-save-1');

    assert.notEqual(pomodoroEvent, null);
    assert.notEqual(reminderEvent, null);
    assert.notEqual(waterEvent, null);
    assert.notEqual(stickyEvent, null);
    assert.equal(
      DEFAULT_PERSONALITY_MESSAGES.pomodoroComplete.includes(
        pomodoroEvent.message,
      ),
      true,
    );
    assert.equal(
      DEFAULT_PERSONALITY_MESSAGES.reminderComplete.includes(
        reminderEvent.message,
      ),
      true,
    );
    assert.equal(
      DEFAULT_PERSONALITY_MESSAGES.hydration.includes(
        waterEvent.message,
      ),
      true,
    );
    assert.equal(
      DEFAULT_PERSONALITY_MESSAGES.stickyMessageSaved.includes(
        stickyEvent.message,
      ),
      true,
    );

    assert.equal(service.emitPomodoroCompletion('focus-1'), null);
    assert.equal(service.emitReminderCompletion('reminder-1'), null);
    assert.equal(
      service.emitWaterReminderAcknowledgement('water-1'),
      null,
    );
    assert.equal(
      service.emitStickyMessageSaved('sticky-save-1'),
      null,
    );
    assert.equal(events.length, 4);
  });

  test('avoids immediate repetition within each trigger pool', () => {
    const service = new PersonalityService({ random: () => 0 });

    const firstPomodoro =
      service.emitPomodoroCompletion('focus-1');
    const secondPomodoro =
      service.emitPomodoroCompletion('focus-2');
    const firstReminder =
      service.emitReminderCompletion('reminder-1');
    const secondReminder =
      service.emitReminderCompletion('reminder-2');

    assert.notEqual(firstPomodoro, null);
    assert.notEqual(secondPomodoro, null);
    assert.notEqual(firstReminder, null);
    assert.notEqual(secondReminder, null);
    assert.notEqual(firstPomodoro.message, secondPomodoro.message);
    assert.notEqual(firstReminder.message, secondReminder.message);
  });

  test('provides assistant action messages from registered pools', () => {
    const service = new PersonalityService({ random: () => 0 });

    assert.equal(
      DEFAULT_PERSONALITY_MESSAGES.reminderCreated.includes(
        service.getReminderCreatedMessage(),
      ),
      true,
    );
    assert.equal(
      DEFAULT_PERSONALITY_MESSAGES.stickyMessageUpdated.includes(
        service.getStickyMessageUpdatedMessage(),
      ),
      true,
    );
    assert.equal(
      DEFAULT_PERSONALITY_MESSAGES.assistantActionFailed.includes(
        service.getAssistantActionFailedMessage(),
      ),
      true,
    );
  });

  test('isolates listener failures and supports unsubscription', () => {
    const listenerErrors = [];
    const receivedEvents = [];
    const service = new PersonalityService({
      onListenerError: (error, event) => {
        listenerErrors.push({ error, event });
      },
    });
    service.subscribe(() => {
      throw new Error('listener failed');
    });
    const unsubscribe = service.subscribe((event) => {
      receivedEvents.push(event);
    });

    service.emitStickyMessageSaved('sticky-save-1');
    unsubscribe();
    service.emitStickyMessageSaved('sticky-save-2');

    assert.equal(listenerErrors.length, 2);
    assert.equal(receivedEvents.length, 1);
    assert.equal(
      receivedEvents[0].trigger,
      PERSONALITY_TRIGGERS.stickyMessageSaved,
    );
  });

  test('rejects invalid event IDs and out-of-pool message overrides', () => {
    const service = new PersonalityService({ random: () => 0 });

    assert.throws(
      () => service.emitReminderCompletion('   '),
      /source event IDs/i,
    );
    assert.throws(
      () =>
        service.emitWaterReminderAcknowledgement(
          'water-1',
          'Unregistered message',
        ),
      /configured message pool/i,
    );

    assert.notEqual(
      service.emitWaterReminderAcknowledgement('water-1'),
      null,
    );
  });
});
