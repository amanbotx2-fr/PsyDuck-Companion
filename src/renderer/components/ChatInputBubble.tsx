import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

export type ChatInputDismissReason = 'escape' | 'outside' | 'window-blur';

export interface ChatInputBubbleProps {
  readonly open: boolean;
  readonly onCancel: (reason: ChatInputDismissReason) => void;
  readonly onSubmit: (prompt: string) => void;
}

export function ChatInputBubble({
  open,
  onCancel,
  onSubmit,
}: ChatInputBubbleProps) {
  const [value, setValue] = useState('');
  const bubbleRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const submissionInProgressRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setValue('');
      submissionInProgressRef.current = false;
      return;
    }

    setValue('');
    submissionInProgressRef.current = false;

    const focusFrameId = requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });

    return () => {
      cancelAnimationFrame(focusFrameId);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleOutsidePointerDown = (event: PointerEvent): void => {
      const target = event.target;

      if (
        (target instanceof Node && bubbleRef.current?.contains(target)) ||
        (target instanceof Element &&
          (target.closest('.psyduck-stage') !== null ||
            target.closest('.floating-companion-panel') !== null ||
            target.closest('.speech-bubble') !== null))
      ) {
        return;
      }

      inputRef.current?.blur();
      onCancel('outside');
    };

    const handleWindowBlur = (): void => {
      inputRef.current?.blur();
      onCancel('window-blur');
    };

    document.addEventListener(
      'pointerdown',
      handleOutsidePointerDown,
      true,
    );
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener(
        'pointerdown',
        handleOutsidePointerDown,
        true,
      );
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [onCancel, open]);

  const submit = (): void => {
    if (!open || submissionInProgressRef.current) {
      return;
    }

    const prompt = value.trim();

    if (prompt.length === 0) {
      return;
    }

    submissionInProgressRef.current = true;
    inputRef.current?.blur();
    onSubmit(prompt);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      inputRef.current?.blur();
      onCancel('escape');
      return;
    }

    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      ref={bubbleRef}
      className="chat-input-bubble"
      data-open={open}
      aria-hidden={!open}
      onSubmit={handleSubmit}
    >
      <label className="visually-hidden" htmlFor="psyduck-chat-input">
        Ask Ducky
      </label>
      <input
        ref={inputRef}
        className="chat-input-bubble__input"
        id="psyduck-chat-input"
        type="text"
        value={value}
        placeholder="Ask Ducky…"
        autoComplete="off"
        disabled={!open}
        tabIndex={open ? 0 : -1}
        onChange={(event) => {
          setValue(event.currentTarget.value);
        }}
        onKeyDown={handleKeyDown}
      />
    </form>
  );
}
