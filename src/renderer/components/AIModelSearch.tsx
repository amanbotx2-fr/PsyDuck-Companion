import {
  forwardRef,
  type KeyboardEvent,
} from 'react';

interface AIModelSearchProps {
  readonly activeDescendant: string | undefined;
  readonly matchingModelCount: number;
  readonly query: string;
  readonly totalModelCount: number;
  readonly onChange: (query: string) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

export const AIModelSearch = forwardRef<
  HTMLInputElement,
  AIModelSearchProps
>(function AIModelSearch(
  {
    activeDescendant,
    matchingModelCount,
    query,
    totalModelCount,
    onChange,
    onKeyDown,
  },
  ref,
) {
  const resultLabel =
    query.trim().length === 0
      ? `${totalModelCount.toLocaleString()} models`
      : `${matchingModelCount.toLocaleString()} of ${totalModelCount.toLocaleString()} models`;

  return (
    <div className="model-search">
      <label className="model-search__label" htmlFor="model-explorer-search">
        Search models
      </label>
      <div className="model-search__control">
        <input
          ref={ref}
          className="model-search__input"
          id="model-explorer-search"
          type="search"
          value={query}
          placeholder="Search by model, provider, or alias"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-autocomplete="list"
          aria-controls="ai-model-explorer-results"
          aria-expanded="true"
          aria-activedescendant={activeDescendant}
          onChange={(event) => {
            onChange(event.currentTarget.value);
          }}
          onKeyDown={onKeyDown}
        />
        <span className="model-search__count" aria-live="polite">
          {resultLabel}
        </span>
      </div>
    </div>
  );
});
