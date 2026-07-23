const TYPEWRITER_MINIMUM_DURATION_MS = 320;
const TYPEWRITER_MAXIMUM_DURATION_MS = 3_200;
const TYPEWRITER_GRAPHEMES_PER_SECOND = 52;

interface SegmenterLike {
  segment(value: string): Iterable<{ readonly segment: string }>;
}

interface SegmenterConstructor {
  new (
    locales?: string | readonly string[],
    options?: { readonly granularity: 'grapheme' },
  ): SegmenterLike;
}

const readSegmenter = (): SegmenterConstructor | null => {
  const intl = Intl as typeof Intl & {
    readonly Segmenter?: SegmenterConstructor;
  };
  return intl.Segmenter ?? null;
};

export const splitIntoGraphemes = (value: string): readonly string[] => {
  const Segmenter = readSegmenter();

  if (Segmenter === null) {
    return Array.from(value);
  }

  return [...new Segmenter(undefined, { granularity: 'grapheme' }).segment(
    value,
  )].map(({ segment }) => segment);
};

export const calculateTypewriterDuration = (
  graphemeCount: number,
): number => {
  if (!Number.isFinite(graphemeCount) || graphemeCount <= 0) {
    return 0;
  }

  return Math.round(
    Math.min(
      Math.max(
        (graphemeCount / TYPEWRITER_GRAPHEMES_PER_SECOND) * 1_000,
        TYPEWRITER_MINIMUM_DURATION_MS,
      ),
      TYPEWRITER_MAXIMUM_DURATION_MS,
    ),
  );
};

export const calculateVisibleGraphemeCount = (
  elapsedMilliseconds: number,
  durationMilliseconds: number,
  totalGraphemeCount: number,
): number => {
  if (totalGraphemeCount <= 0) {
    return 0;
  }

  if (
    !Number.isFinite(durationMilliseconds) ||
    durationMilliseconds <= 0
  ) {
    return totalGraphemeCount;
  }

  const progress = Math.min(
    Math.max(elapsedMilliseconds / durationMilliseconds, 0),
    1,
  );

  return Math.min(
    totalGraphemeCount,
    Math.ceil(progress * totalGraphemeCount),
  );
};
