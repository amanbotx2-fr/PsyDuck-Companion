const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  parseSpeechBubbleMarkdown,
  parseSpeechMarkdownInline,
  speechBubbleMarkdownToPlainText,
} = require('../dist/shared/speechBubbleMarkdown.js');
const {
  calculateTypewriterDuration,
  calculateVisibleGraphemeCount,
  splitIntoGraphemes,
} = require('../dist/shared/typewriter.js');

describe('speech bubble Markdown', () => {
  test('parses bold text and inline code without interpreting HTML', () => {
    assert.deepEqual(
      parseSpeechBubbleMarkdown(
        'Use **careful defaults** and `<unsafe>` literally.',
      ),
      [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'Use ' },
            {
              type: 'strong',
              children: [{ type: 'text', value: 'careful defaults' }],
            },
            { type: 'text', value: ' and ' },
            { type: 'inline-code', value: '<unsafe>' },
            { type: 'text', value: ' literally.' },
          ],
        },
      ],
    );
  });

  test('parses ordered and unordered lists into separate blocks', () => {
    assert.deepEqual(
      parseSpeechBubbleMarkdown(
        '- First item\n- **Second** item\n\n1. Start\n2. Finish',
      ),
      [
        {
          type: 'list',
          ordered: false,
          items: [
            [{ type: 'text', value: 'First item' }],
            [
              {
                type: 'strong',
                children: [{ type: 'text', value: 'Second' }],
              },
              { type: 'text', value: ' item' },
            ],
          ],
        },
        {
          type: 'list',
          ordered: true,
          items: [
            [{ type: 'text', value: 'Start' }],
            [{ type: 'text', value: 'Finish' }],
          ],
        },
      ],
    );
  });

  test('preserves fenced code and normalizes safe language labels', () => {
    assert.deepEqual(
      parseSpeechBubbleMarkdown(
        '```ts\nconst answer = 42;\nconsole.log(answer);\n```',
      ),
      [
        {
          type: 'code-block',
          language: 'ts',
          value: 'const answer = 42;\nconsole.log(answer);',
        },
      ],
    );
  });

  test('leaves unsupported markup and escaped delimiters as text', () => {
    assert.deepEqual(
      parseSpeechMarkdownInline(
        '<button>safe text</button> and \\**literal\\**',
      ),
      [
        {
          type: 'text',
          value: '<button>safe text</button> and **literal**',
        },
      ],
    );
  });

  test('creates a clean accessible text projection', () => {
    assert.equal(
      speechBubbleMarkdownToPlainText(
        '**Summary**\n\n- One\n- `Two`\n\n```ts\nconst ready = true;\n```',
      ),
      'Summary\n\n- One\n- Two\n\nconst ready = true;',
    );
  });
});

describe('speech bubble typewriter timing', () => {
  test('segments user-perceived characters without splitting emoji', () => {
    assert.deepEqual(
      splitIntoGraphemes('A👨‍👩‍👧‍👦B'),
      ['A', '👨‍👩‍👧‍👦', 'B'],
    );
  });

  test('keeps animation duration inside the readable bounds', () => {
    assert.equal(calculateTypewriterDuration(0), 0);
    assert.equal(calculateTypewriterDuration(1), 320);
    assert.equal(calculateTypewriterDuration(10_000), 3_200);
  });

  test('clamps visible character progress at both ends', () => {
    assert.equal(calculateVisibleGraphemeCount(-20, 1_000, 10), 0);
    assert.equal(calculateVisibleGraphemeCount(500, 1_000, 10), 5);
    assert.equal(calculateVisibleGraphemeCount(2_000, 1_000, 10), 10);
    assert.equal(calculateVisibleGraphemeCount(20, 0, 10), 10);
  });
});
