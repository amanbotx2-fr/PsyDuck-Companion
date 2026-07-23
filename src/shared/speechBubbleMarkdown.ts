export type SpeechMarkdownInline =
  | {
      readonly type: 'text';
      readonly value: string;
    }
  | {
      readonly type: 'strong';
      readonly children: readonly SpeechMarkdownInline[];
    }
  | {
      readonly type: 'inline-code';
      readonly value: string;
    };

export type SpeechMarkdownBlock =
  | {
      readonly type: 'paragraph';
      readonly children: readonly SpeechMarkdownInline[];
    }
  | {
      readonly type: 'list';
      readonly ordered: boolean;
      readonly items: readonly (readonly SpeechMarkdownInline[])[];
    }
  | {
      readonly type: 'code-block';
      readonly language: string | null;
      readonly value: string;
    };

const FENCE_PATTERN = /^\s{0,3}```\s*([^\s`]*)?.*$/;
const FENCE_CLOSE_PATTERN = /^\s{0,3}```\s*$/;
const UNORDERED_LIST_PATTERN = /^\s*[-+*]\s+(.+)$/;
const ORDERED_LIST_PATTERN = /^\s*\d+[.)]\s+(.+)$/;
const MAXIMUM_CODE_LANGUAGE_LENGTH = 32;

const findClosingDelimiter = (
  value: string,
  delimiter: string,
  fromIndex: number,
): number => {
  let index = fromIndex;

  while (index <= value.length - delimiter.length) {
    if (value[index] === '\\') {
      index += 2;
      continue;
    }

    if (value.startsWith(delimiter, index)) {
      return index;
    }

    index += 1;
  }

  return -1;
};

const appendText = (
  nodes: SpeechMarkdownInline[],
  value: string,
): void => {
  if (value.length === 0) {
    return;
  }

  const finalNode = nodes.at(-1);

  if (finalNode?.type === 'text') {
    nodes[nodes.length - 1] = {
      type: 'text',
      value: `${finalNode.value}${value}`,
    };
    return;
  }

  nodes.push({ type: 'text', value });
};

const parseInlineMarkdownInternal = (
  value: string,
  allowStrong: boolean,
): readonly SpeechMarkdownInline[] => {
  const nodes: SpeechMarkdownInline[] = [];
  let textBuffer = '';
  let index = 0;

  const flushText = (): void => {
    appendText(nodes, textBuffer);
    textBuffer = '';
  };

  while (index < value.length) {
    if (value[index] === '\\' && index + 1 < value.length) {
      const escapedCharacter = value[index + 1];

      if (
        escapedCharacter === '\\' ||
        escapedCharacter === '`' ||
        escapedCharacter === '*'
      ) {
        textBuffer += escapedCharacter;
        index += 2;
        continue;
      }
    }

    if (value[index] === '`') {
      const closingIndex = findClosingDelimiter(value, '`', index + 1);

      if (closingIndex !== -1) {
        flushText();
        nodes.push({
          type: 'inline-code',
          value: value.slice(index + 1, closingIndex),
        });
        index = closingIndex + 1;
        continue;
      }
    }

    if (allowStrong && value.startsWith('**', index)) {
      const closingIndex = findClosingDelimiter(value, '**', index + 2);

      if (closingIndex > index + 2) {
        flushText();
        nodes.push({
          type: 'strong',
          children: parseInlineMarkdownInternal(
            value.slice(index + 2, closingIndex),
            false,
          ),
        });
        index = closingIndex + 2;
        continue;
      }
    }

    textBuffer += value[index];
    index += 1;
  }

  flushText();
  return nodes;
};

export const parseSpeechMarkdownInline = (
  value: string,
): readonly SpeechMarkdownInline[] =>
  parseInlineMarkdownInternal(value, true);

const inlineNodesToPlainText = (
  nodes: readonly SpeechMarkdownInline[],
): string =>
  nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'inline-code':
          return node.value;
        case 'strong':
          return inlineNodesToPlainText(node.children);
      }
    })
    .join('');

const readListItem = (
  line: string,
  ordered: boolean,
): string | null => {
  const match = ordered
    ? ORDERED_LIST_PATTERN.exec(line)
    : UNORDERED_LIST_PATTERN.exec(line);
  return match?.[1]?.trim() ?? null;
};

const isBlockBoundary = (line: string): boolean =>
  line.trim().length === 0 ||
  FENCE_PATTERN.test(line) ||
  UNORDERED_LIST_PATTERN.test(line) ||
  ORDERED_LIST_PATTERN.test(line);

const normalizeCodeLanguage = (value: string | undefined): string | null => {
  const language = value?.trim() ?? '';

  if (
    language.length === 0 ||
    language.length > MAXIMUM_CODE_LANGUAGE_LENGTH ||
    !/^[A-Za-z0-9_+-]+$/.test(language)
  ) {
    return null;
  }

  return language;
};

export const parseSpeechBubbleMarkdown = (
  value: string,
): readonly SpeechMarkdownBlock[] => {
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  const blocks: SpeechMarkdownBlock[] = [];
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    const line = lines[lineIndex] ?? '';

    if (line.trim().length === 0) {
      lineIndex += 1;
      continue;
    }

    const fenceMatch = FENCE_PATTERN.exec(line);

    if (fenceMatch !== null) {
      const codeLines: string[] = [];
      lineIndex += 1;

      while (
        lineIndex < lines.length &&
        !FENCE_CLOSE_PATTERN.test(lines[lineIndex] ?? '')
      ) {
        codeLines.push(lines[lineIndex] ?? '');
        lineIndex += 1;
      }

      if (lineIndex < lines.length) {
        lineIndex += 1;
      }

      blocks.push({
        type: 'code-block',
        language: normalizeCodeLanguage(fenceMatch[1]),
        value: codeLines.join('\n'),
      });
      continue;
    }

    const isUnorderedList = UNORDERED_LIST_PATTERN.test(line);
    const isOrderedList = ORDERED_LIST_PATTERN.test(line);

    if (isUnorderedList || isOrderedList) {
      const ordered = isOrderedList;
      const items: SpeechMarkdownInline[][] = [];

      while (lineIndex < lines.length) {
        const item = readListItem(lines[lineIndex] ?? '', ordered);

        if (item === null) {
          break;
        }

        items.push([...parseSpeechMarkdownInline(item)]);
        lineIndex += 1;
      }

      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraphLines = [line.trim()];
    lineIndex += 1;

    while (
      lineIndex < lines.length &&
      !isBlockBoundary(lines[lineIndex] ?? '')
    ) {
      paragraphLines.push((lines[lineIndex] ?? '').trim());
      lineIndex += 1;
    }

    blocks.push({
      type: 'paragraph',
      children: parseSpeechMarkdownInline(paragraphLines.join(' ')),
    });
  }

  return blocks;
};

export const speechBubbleMarkdownToPlainText = (
  value: string,
): string =>
  parseSpeechBubbleMarkdown(value)
    .map((block) => {
      switch (block.type) {
        case 'paragraph':
          return inlineNodesToPlainText(block.children);
        case 'list':
          return block.items
            .map((item, index) => {
              const prefix = block.ordered ? `${index + 1}.` : '-';
              return `${prefix} ${inlineNodesToPlainText(item)}`;
            })
            .join('\n');
        case 'code-block':
          return block.value;
      }
    })
    .join('\n\n');
