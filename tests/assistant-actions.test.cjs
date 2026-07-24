const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { describe, test } = require('node:test');

const {
  AssistantActionExecutionError,
  AssistantActionExecutor,
  AssistantActionParseError,
  AssistantActionResponseProcessor,
  createAssistantActionPrompt,
  interpretAssistantResponse,
} = require('../dist/ai/actions/index.js');
const {
  ReminderService,
} = require('../dist/main/ReminderService.js');
const { SettingsService } = require('../dist/main/SettingsService.js');

const unavailableCredentialManager = {
  decrypt: () => '',
  encrypt: () => {
    throw new Error('Credential storage is unavailable in this test.');
  },
  isEncryptionAvailable: () => false,
};

const createHarness = () => {
  const reminderInputs = [];
  const stickyMessageInputs = [];
  const executor = new AssistantActionExecutor({
    reminderService: {
      createReminder: async (input) => {
        reminderInputs.push(input);
        return { id: 'created-reminder' };
      },
    },
    settingsService: {
      updateStickyMessage: async (message) => {
        stickyMessageInputs.push(message);
        return String(message).trim();
      },
    },
    messages: {
      getReminderCreatedMessage: () => "I've added that reminder.",
      getStickyMessageUpdatedMessage: () => 'Sticky note updated.',
    },
  });

  return {
    executor,
    processor: new AssistantActionResponseProcessor(executor),
    reminderInputs,
    stickyMessageInputs,
  };
};

const createProviderResponse = (content) => ({
  providerId: 'openai',
  content,
  finishReason: 'stop',
  usage: {
    inputTokens: 20,
    outputTokens: 10,
  },
});

describe('assistant action parsing and execution', () => {
  test('creates a reminder through the registered ReminderService', async () => {
    const harness = createHarness();
    const action = {
      type: 'createReminder',
      payload: {
        title: 'Call John',
        message: 'Discuss the release.',
        scheduledAt: '2030-01-02T17:00:00.000+05:30',
        recurrence: {
          type: 'weekly',
        },
      },
    };
    const response = await harness.processor.process(
      createProviderResponse(JSON.stringify(action)),
    );

    assert.deepEqual(harness.reminderInputs, [action.payload]);
    assert.deepEqual(harness.stickyMessageInputs, []);
    assert.equal(response.content, "I've added that reminder.");
    assert.equal(response.finishReason, 'stop');
    assert.deepEqual(response.usage, {
      inputTokens: 20,
      outputTokens: 10,
    });
  });

  test('updates the sticky message through the registered SettingsService', async () => {
    const harness = createHarness();
    const response = await harness.processor.process(
      createProviderResponse(
        [
          '```json',
          JSON.stringify({
            type: 'setStickyMessage',
            payload: {
              message: 'Review the deployment checklist.',
            },
          }),
          '```',
        ].join('\n'),
      ),
    );

    assert.deepEqual(harness.reminderInputs, []);
    assert.deepEqual(harness.stickyMessageInputs, [
      'Review the deployment checklist.',
    ]);
    assert.equal(response.content, 'Sticky note updated.');
  });

  test('rejects unknown action types before any service invocation', async () => {
    const harness = createHarness();

    await assert.rejects(
      () =>
        harness.processor.process(
          createProviderResponse(
            JSON.stringify({
              type: 'runShell',
              payload: { command: 'open .' },
            }),
          ),
        ),
      (error) =>
        error instanceof AssistantActionParseError &&
        error.code === 'unknown_action',
    );
    assert.deepEqual(harness.reminderInputs, []);
    assert.deepEqual(harness.stickyMessageInputs, []);
  });

  test('rejects malformed payloads before any service invocation', async () => {
    const harness = createHarness();
    const invalidActions = [
      {
        type: 'createReminder',
        payload: {
          title: 'Missing schedule',
        },
      },
      {
        type: 'createReminder',
        payload: {
          title: 'Invalid recurrence',
          scheduledAt: '2030-01-02T17:00:00.000Z',
          recurrence: {
            type: 'interval',
            unit: 'hours',
            value: 0,
          },
        },
      },
      {
        type: 'setStickyMessage',
        payload: {
          message: 42,
        },
      },
    ];

    for (const action of invalidActions) {
      await assert.rejects(
        () =>
          harness.processor.process(
            createProviderResponse(JSON.stringify(action)),
          ),
        (error) =>
          error instanceof AssistantActionParseError &&
          error.code === 'invalid_payload',
      );
    }

    assert.deepEqual(harness.reminderInputs, []);
    assert.deepEqual(harness.stickyMessageInputs, []);
  });

  test('leaves settings unchanged when ReminderService rejects business validation', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'psyduck-assistant-action-'),
    );
    const settingsService = new SettingsService(
      join(directory, 'settings.json'),
      unavailableCredentialManager,
    );
    await settingsService.load();
    const reminderService = new ReminderService(settingsService, {
      createId: () => 'assistant-reminder',
      now: () => new Date('2030-01-01T12:00:00.000Z'),
    });
    let confirmationCalls = 0;
    const processor = new AssistantActionResponseProcessor(
      new AssistantActionExecutor({
        reminderService,
        settingsService,
        messages: {
          getReminderCreatedMessage: () => {
            confirmationCalls += 1;
            return "I've added that reminder.";
          },
          getStickyMessageUpdatedMessage: () => 'Sticky note updated.',
        },
      }),
    );

    try {
      await assert.rejects(
        () =>
          processor.process(
            createProviderResponse(
              JSON.stringify({
                type: 'createReminder',
                payload: {
                  title: '   ',
                  scheduledAt: '2030-01-02T12:00:00.000Z',
                },
              }),
            ),
          ),
        /title is required/i,
      );
      assert.deepEqual(reminderService.listReminders(), []);
      assert.equal(confirmationCalls, 0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('keeps ordinary AI responses unchanged', async () => {
    const harness = createHarness();
    const originalResponse = createProviderResponse(
      'Here is a concise explanation.',
    );
    const response = await harness.processor.process(originalResponse);

    assert.deepEqual(response, originalResponse);
    assert.deepEqual(harness.reminderInputs, []);
    assert.deepEqual(harness.stickyMessageInputs, []);
  });

  test('keeps an executor-level allowlist as a second trust boundary', async () => {
    const harness = createHarness();

    await assert.rejects(
      () =>
        harness.executor.execute({
          type: 'unknownAction',
          payload: {},
        }),
      AssistantActionExecutionError,
    );
    assert.deepEqual(harness.reminderInputs, []);
    assert.deepEqual(harness.stickyMessageInputs, []);
  });
});

describe('assistant action prompt', () => {
  test('provides the typed action contract and deterministic local clock context', () => {
    const prompt = createAssistantActionPrompt(
      'Remind me tomorrow at 5 PM to call John.',
      {
        now: new Date('2030-01-01T12:00:00.000Z'),
        timeZone: 'Asia/Kolkata',
      },
    );

    assert.match(prompt, /"type":"createReminder"/);
    assert.match(prompt, /"type":"setStickyMessage"/);
    assert.match(prompt, /IANA timezone: Asia\/Kolkata/);
    assert.match(prompt, /Current UTC time: 2030-01-01T12:00:00.000Z/);
    assert.match(
      prompt,
      /Remind me tomorrow at 5 PM to call John\./,
    );
  });

  test('includes prior conversation separately from the current request', () => {
    const prompt = createAssistantActionPrompt('Can you expand on that?', {
      now: new Date('2030-01-01T12:00:00.000Z'),
      timeZone: 'UTC',
      conversationHistory: [
        { role: 'user', content: 'Give me a short release checklist.' },
        { role: 'assistant', content: 'Build, verify, tag, and publish.' },
      ],
    });

    assert.match(prompt, /<conversation_history_json>/);
    assert.match(
      prompt,
      /"role":"assistant","content":"Build, verify, tag, and publish\."/,
    );
    assert.match(
      prompt,
      /<user_request>\nCan you expand on that\?\n<\/user_request>/,
    );
  });

  test('does not interpret unrelated JSON as an action', () => {
    assert.deepEqual(
      interpretAssistantResponse('{"answer":42}'),
      {
        kind: 'message',
        content: '{"answer":42}',
      },
    );
  });

  test('rejects malformed action JSON instead of displaying it as chat text', () => {
    assert.throws(
      () =>
        interpretAssistantResponse(
          '{"type":"createReminder","payload":',
        ),
      (error) =>
        error instanceof AssistantActionParseError &&
        error.code === 'invalid_action',
    );
  });
});
