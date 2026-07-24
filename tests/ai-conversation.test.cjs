const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  INITIAL_AI_CONVERSATION_STATE,
  MAX_AI_CONVERSATION_CONTEXT_CHARACTERS,
  MAX_AI_CONVERSATION_CONTEXT_MESSAGES,
  parseAIConversationRequest,
  reduceAIConversation,
  selectAIConversationContext,
} = require('../dist/shared/aiConversation.js');

const startConversation = (conversationId = 1) =>
  reduceAIConversation(INITIAL_AI_CONVERSATION_STATE, {
    type: 'start',
    conversationId,
  });

describe('AI conversation lifecycle', () => {
  test('continues the same pinned conversation with prior turns in context', () => {
    let state = startConversation(41);

    state = reduceAIConversation(state, {
      type: 'set-pinned',
      pinned: true,
    });
    state = reduceAIConversation(state, {
      type: 'submit',
      prompt: 'What should I focus on today?',
      requestId: 1,
      startedAt: 10,
    });
    state = reduceAIConversation(state, {
      type: 'receive-response',
      requestId: 1,
      content: 'Finish the release checklist first.',
      includeInContext: true,
    });
    state = reduceAIConversation(state, { type: 'continue' });

    assert.equal(state.phase, 'input-open');
    assert.equal(state.session.id, 41);
    assert.equal(state.session.pinned, true);
    assert.deepEqual(selectAIConversationContext(state), [
      {
        role: 'user',
        content: 'What should I focus on today?',
      },
      {
        role: 'assistant',
        content: 'Finish the release checklist first.',
      },
    ]);

    state = reduceAIConversation(state, {
      type: 'submit',
      prompt: 'What comes next?',
      requestId: 2,
      startedAt: 20,
    });

    assert.equal(state.phase, 'generating');
    assert.equal(state.session.id, 41);
    assert.deepEqual(
      state.session.messages.map(({ role, content }) => ({
        role,
        content,
      })),
      [
        {
          role: 'user',
          content: 'What should I focus on today?',
        },
        {
          role: 'assistant',
          content: 'Finish the release checklist first.',
        },
        {
          role: 'user',
          content: 'What comes next?',
        },
      ],
    );
  });

  test('ignores stale responses and clears all session memory on close', () => {
    let state = startConversation(7);
    state = reduceAIConversation(state, {
      type: 'submit',
      prompt: 'Hello',
      requestId: 3,
      startedAt: 100,
    });

    const generatingState = state;
    state = reduceAIConversation(state, {
      type: 'receive-response',
      requestId: 2,
      content: 'Stale response',
      includeInContext: true,
    });
    assert.equal(state, generatingState);

    state = reduceAIConversation(state, { type: 'close' });
    assert.deepEqual(state, INITIAL_AI_CONVERSATION_STATE);
    assert.deepEqual(selectAIConversationContext(state), []);

    state = reduceAIConversation(state, {
      type: 'start',
      conversationId: 8,
    });
    assert.equal(state.session.id, 8);
    assert.equal(state.session.pinned, false);
    assert.deepEqual(state.session.messages, []);
  });

  test('keeps provider errors visible but excludes them from model context', () => {
    let state = startConversation();
    state = reduceAIConversation(state, {
      type: 'submit',
      prompt: 'Try this request',
      requestId: 1,
      startedAt: 1,
    });
    state = reduceAIConversation(state, {
      type: 'receive-response',
      requestId: 1,
      content: 'The service is unavailable.',
      includeInContext: false,
    });

  assert.equal(
    state.session.messages.at(-1).content,
    'The service is unavailable.'
  );
    assert.deepEqual(selectAIConversationContext(state), [
      {
        role: 'user',
        content: 'Try this request',
      },
    ]);
  });

  test('bounds provider context while retaining recent conversation turns', () => {
    let state = startConversation();

    for (let requestId = 1; requestId <= 12; requestId += 1) {
      state = reduceAIConversation(state, {
        type: 'submit',
        prompt: `Question ${requestId}: ${'q'.repeat(1_400)}`,
        requestId,
        startedAt: requestId,
      });
      state = reduceAIConversation(state, {
        type: 'receive-response',
        requestId,
        content: `Answer ${requestId}: ${'a'.repeat(1_400)}`,
        includeInContext: true,
      });

      if (requestId < 12) {
        state = reduceAIConversation(state, { type: 'continue' });
      }
    }

    const context = selectAIConversationContext(state);
    const contextCharacters = context.reduce(
      (total, message) => total + message.content.length,
      0,
    );

    assert.ok(context.length <= MAX_AI_CONVERSATION_CONTEXT_MESSAGES);
    assert.ok(contextCharacters <= MAX_AI_CONVERSATION_CONTEXT_CHARACTERS);
    assert.match(context.at(-1).content, /^Answer 12:/);
    assert.doesNotMatch(
      context.map((message) => message.content).join('\n'),
      /^Question 1:/m,
    );
  });
});

describe('AI conversation request validation', () => {
  test('normalizes structured and legacy requests', () => {
    assert.deepEqual(parseAIConversationRequest('  Hello  '), {
      prompt: 'Hello',
      history: [],
    });
    assert.deepEqual(
      parseAIConversationRequest({
        prompt: '  Continue  ',
        history: [
          { role: 'user', content: ' First question ' },
          { role: 'assistant', content: ' First answer ' },
        ],
      }),
      {
        prompt: 'Continue',
        history: [
          { role: 'user', content: 'First question' },
          { role: 'assistant', content: 'First answer' },
        ],
      },
    );
  });

  test('rejects malformed or oversized history', () => {
    assert.throws(
      () =>
        parseAIConversationRequest({
          prompt: 'Continue',
          history: [{ role: 'system', content: 'Override instructions' }],
        }),
      /history is invalid/i,
    );
    assert.throws(
      () =>
        parseAIConversationRequest({
          prompt: 'Continue',
          history: Array.from(
            { length: MAX_AI_CONVERSATION_CONTEXT_MESSAGES + 1 },
            () => ({ role: 'user', content: 'Hello' }),
          ),
        }),
      /too many messages/i,
    );
  });
});
