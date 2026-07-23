import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  calculateTypewriterDuration,
  calculateVisibleGraphemeCount,
  splitIntoGraphemes,
} from '../../shared/typewriter';

export interface UseTypewriterTextOptions {
  readonly active: boolean;
  readonly enabled: boolean;
  readonly onComplete: () => void;
  readonly resetKey: number;
  readonly text: string;
}

export interface TypewriterTextState {
  readonly complete: boolean;
  readonly displayedText: string;
}

export function useTypewriterText({
  active,
  enabled,
  onComplete,
  resetKey,
  text,
}: UseTypewriterTextOptions): TypewriterTextState {
  const graphemes = useMemo(() => splitIntoGraphemes(text), [text]);
  const [visibleCount, setVisibleCount] = useState(
    enabled ? 0 : graphemes.length,
  );
  const onCompleteRef = useRef(onComplete);

  useLayoutEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let animationFrameId: number | null = null;
    let disposed = false;
    let completionSent = false;

    const finish = (): void => {
      if (disposed || completionSent) {
        return;
      }

      completionSent = true;
      onCompleteRef.current();
    };

    if (!enabled) {
      setVisibleCount(graphemes.length);
      return () => {
        disposed = true;
      };
    }

    if (!active) {
      setVisibleCount(0);
      return () => {
        disposed = true;
      };
    }

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const duration = calculateTypewriterDuration(graphemes.length);

    if (reducedMotion || duration === 0) {
      setVisibleCount(graphemes.length);
      globalThis.queueMicrotask(finish);

      return () => {
        disposed = true;
      };
    }

    setVisibleCount(0);
    const startedAt = performance.now();
    let previousVisibleCount = 0;

    const update = (timestamp: number): void => {
      const nextVisibleCount = calculateVisibleGraphemeCount(
        timestamp - startedAt,
        duration,
        graphemes.length,
      );

      if (nextVisibleCount !== previousVisibleCount) {
        previousVisibleCount = nextVisibleCount;
        setVisibleCount(nextVisibleCount);
      }

      if (nextVisibleCount >= graphemes.length) {
        finish();
        return;
      }

      animationFrameId = requestAnimationFrame(update);
    };

    animationFrameId = requestAnimationFrame(update);

    return () => {
      disposed = true;

      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [active, enabled, graphemes, resetKey]);

  return {
    complete: visibleCount >= graphemes.length,
    displayedText: graphemes.slice(0, visibleCount).join(''),
  };
}
