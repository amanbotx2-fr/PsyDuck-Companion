import { Fragment, useMemo, type ReactNode } from 'react';

import {
  parseSpeechBubbleMarkdown,
  type SpeechMarkdownInline,
} from '../../shared/speechBubbleMarkdown';

export interface SpeechBubbleMarkdownProps {
  readonly text: string;
}

const renderInlineNodes = (
  nodes: readonly SpeechMarkdownInline[],
  keyPrefix: string,
): readonly ReactNode[] =>
  nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;

    switch (node.type) {
      case 'text':
        return <Fragment key={key}>{node.value}</Fragment>;
      case 'strong':
        return (
          <strong key={key}>
            {renderInlineNodes(node.children, `${key}-strong`)}
          </strong>
        );
      case 'inline-code':
        return <code key={key}>{node.value}</code>;
    }
  });

export function SpeechBubbleMarkdown({
  text,
}: SpeechBubbleMarkdownProps) {
  const blocks = useMemo(() => parseSpeechBubbleMarkdown(text), [text]);

  return (
    <div className="speech-bubble__markdown">
      {blocks.map((block, blockIndex) => {
        const key = `block-${blockIndex}`;

        switch (block.type) {
          case 'paragraph':
            return (
              <p key={key}>
                {renderInlineNodes(block.children, `${key}-inline`)}
              </p>
            );
          case 'list': {
            const ListElement = block.ordered ? 'ol' : 'ul';

            return (
              <ListElement key={key}>
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-item-${itemIndex}`}>
                    {renderInlineNodes(
                      item,
                      `${key}-item-${itemIndex}-inline`,
                    )}
                  </li>
                ))}
              </ListElement>
            );
          }
          case 'code-block':
            return (
              <pre key={key}>
                <code
                  {...(block.language === null
                    ? {}
                    : { 'data-language': block.language })}
                >
                  {block.value}
                </code>
              </pre>
            );
        }
      })}
    </div>
  );
}
