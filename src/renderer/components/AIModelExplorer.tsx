import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

import type {
  ModelExplorerEntry,
  ModelExplorerSource,
  ModelRecommendationTier,
} from '../../shared/modelMetadata';
import type {
  AiModelExplorerSettings,
  AiProvider,
} from '../../shared/settings';
import { useModelExplorer } from '../hooks/useModelExplorer';
import { AIModelCard } from './AIModelCard';
import { AIModelGroup } from './AIModelGroup';
import { AIModelSearch } from './AIModelSearch';

interface AIModelExplorerProps {
  readonly disabled: boolean;
  readonly models: readonly ModelExplorerSource[];
  readonly preferences: AiModelExplorerSettings;
  readonly provider: AiProvider;
  readonly selectedModelId: string;
  readonly onSelect: (modelId: string) => void;
  readonly onToggleFavorite: (modelId: string) => void;
}

interface ModelSectionProps {
  readonly activeModelId: string | null;
  readonly favoriteModelIds: ReadonlySet<string>;
  readonly heading: string;
  readonly models: readonly ModelExplorerEntry[];
  readonly recommendationTiers?: ReadonlyMap<
    string,
    ModelRecommendationTier
  >;
  readonly selectedModelId: string;
  readonly onActivate: (modelId: string) => void;
  readonly onSelect: (modelId: string) => void;
  readonly onToggleFavorite: (modelId: string) => void;
}

const getOptionId = (modelId: string): string =>
  `model-option-${encodeURIComponent(modelId).replaceAll('%', '')}`;

function ModelSection({
  activeModelId,
  favoriteModelIds,
  heading,
  models,
  recommendationTiers,
  selectedModelId,
  onActivate,
  onSelect,
  onToggleFavorite,
}: ModelSectionProps) {
  if (models.length === 0) {
    return null;
  }

  return (
    <section className="model-explorer__section">
      <div className="model-explorer__section-heading">
        <h3>{heading}</h3>
        <span>{models.length.toLocaleString()}</span>
      </div>
      <div className="model-explorer__section-models">
        {models.map((model) => {
          const recommendationTier = recommendationTiers?.get(model.id);

          return (
            <AIModelCard
              key={model.id}
              model={model}
              optionId={getOptionId(model.id)}
              active={activeModelId === model.id}
              selected={selectedModelId === model.id}
              favorite={favoriteModelIds.has(model.id)}
              {...(recommendationTier === undefined
                ? {}
                : { recommendationTier })}
              onActivate={onActivate}
              onSelect={onSelect}
              onToggleFavorite={onToggleFavorite}
            />
          );
        })}
      </div>
    </section>
  );
}

export function AIModelExplorer({
  disabled,
  models,
  preferences,
  provider,
  selectedModelId,
  onSelect,
  onToggleFavorite,
}: AIModelExplorerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const restoreTriggerFocusRef = useRef(false);
  const {
    query,
    setQuery,
    totalModelCount,
    matchingModelCount,
    favorites,
    recent,
    recommended,
    groups,
    expandedGroups,
    activeModelId,
    selectedModel,
    toggleGroup,
    moveActiveModel,
    setActiveModelId,
  } = useModelExplorer({
    models,
    provider,
    selectedModelId,
    preferences,
    open,
  });
  const favoriteModelIds = useMemo(
    () =>
      new Set(
        preferences.favorites
          .filter((favorite) => favorite.provider === provider)
          .map((favorite) => favorite.modelId),
      ),
    [preferences.favorites, provider],
  );
  const recommendationTiers = useMemo(
    () =>
      new Map(
        recommended.map(({ model, tier }) => [model.id, tier] as const),
      ),
    [recommended],
  );
  const browseModelCount = useMemo(
    () =>
      groups.reduce(
        (modelCount, group) => modelCount + group.models.length,
        0,
      ),
    [groups],
  );
  const activeOptionId =
    activeModelId === null ? undefined : getOptionId(activeModelId);

  const closeExplorer = useCallback((): void => {
    restoreTriggerFocusRef.current = true;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (
      open ||
      disabled ||
      !restoreTriggerFocusRef.current
    ) {
      return;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
      restoreTriggerFocusRef.current = false;
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
    };
  }, [disabled, open]);

  const selectModel = useCallback(
    (modelId: string): void => {
      onSelect(modelId);
      closeExplorer();
    },
    [closeExplorer, onSelect],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => {
      searchRef.current?.focus();
      searchRef.current?.select();
    });

    const handleDialogKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeExplorer();
        return;
      }

      if (event.key !== 'Tab' || dialogRef.current === null) {
        return;
      }

      const focusableElements = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ];
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (firstElement === undefined || lastElement === undefined) {
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === lastElement
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleDialogKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener('keydown', handleDialogKeyDown);
    };
  }, [closeExplorer, open]);

  useEffect(() => {
    if (!open || activeOptionId === undefined) {
      return;
    }

    const scrollFrame = window.requestAnimationFrame(() => {
      document.getElementById(activeOptionId)?.scrollIntoView({
        block: 'nearest',
      });
    });

    return () => {
      window.cancelAnimationFrame(scrollFrame);
    };
  }, [activeOptionId, open, query]);

  const handleSearchKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
  ): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActiveModel(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActiveModel(-1);
    } else if (event.key === 'Enter' && activeModelId !== null) {
      event.preventDefault();
      selectModel(activeModelId);
    }
  };

  const triggerLabel =
    selectedModel?.displayName ??
    (selectedModelId.trim().length > 0 ? selectedModelId : 'Choose a model');

  return (
    <>
      <button
        ref={triggerRef}
        className="model-explorer-trigger"
        id="ai-model"
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
        }}
      >
        <span className="model-explorer-trigger__label">{triggerLabel}</span>
        <span className="model-explorer-trigger__action">
          Browse models
        </span>
      </button>
      {open
        ? createPortal(
            <div
              className="model-explorer-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  closeExplorer();
                }
              }}
            >
              <div
                ref={dialogRef}
                className="model-explorer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="model-explorer-title"
                aria-describedby="model-explorer-description"
              >
                <header className="model-explorer__header">
                  <div>
                    <h2 id="model-explorer-title">Choose a model</h2>
                    <p id="model-explorer-description">
                      Search the models returned by the selected provider.
                    </p>
                  </div>
                  <button
                    className="model-explorer__close"
                    type="button"
                    onClick={closeExplorer}
                  >
                    Close
                  </button>
                </header>

                <AIModelSearch
                  ref={searchRef}
                  query={query}
                  totalModelCount={totalModelCount}
                  matchingModelCount={matchingModelCount}
                  activeDescendant={activeOptionId}
                  onChange={setQuery}
                  onKeyDown={handleSearchKeyDown}
                />

                <div
                  className="model-explorer__results"
                  id="ai-model-explorer-results"
                  role="listbox"
                  aria-label="Available AI models"
                >
                  <ModelSection
                    heading="Favorites"
                    models={favorites}
                    activeModelId={activeModelId}
                    selectedModelId={selectedModelId}
                    favoriteModelIds={favoriteModelIds}
                    onActivate={setActiveModelId}
                    onSelect={selectModel}
                    onToggleFavorite={onToggleFavorite}
                  />
                  <ModelSection
                    heading="Recently used"
                    models={recent}
                    activeModelId={activeModelId}
                    selectedModelId={selectedModelId}
                    favoriteModelIds={favoriteModelIds}
                    onActivate={setActiveModelId}
                    onSelect={selectModel}
                    onToggleFavorite={onToggleFavorite}
                  />
                  <ModelSection
                    heading="Recommended"
                    models={recommended.map(({ model }) => model)}
                    recommendationTiers={recommendationTiers}
                    activeModelId={activeModelId}
                    selectedModelId={selectedModelId}
                    favoriteModelIds={favoriteModelIds}
                    onActivate={setActiveModelId}
                    onSelect={selectModel}
                    onToggleFavorite={onToggleFavorite}
                  />

                  {groups.length === 0 ? null : (
                    <div className="model-explorer__browse-heading">
                      <h3>Browse models</h3>
                      <span>{browseModelCount.toLocaleString()}</span>
                    </div>
                  )}
                  {groups.map((group) => (
                    <AIModelGroup
                      key={group.name}
                      group={group}
                      collapsible={query.trim().length === 0}
                      expanded={
                        query.trim().length > 0 ||
                        expandedGroups.has(group.name)
                      }
                      activeModelId={activeModelId}
                      selectedModelId={selectedModelId}
                      favoriteModelIds={favoriteModelIds}
                      getOptionId={getOptionId}
                      onActivate={setActiveModelId}
                      onSelect={selectModel}
                      onToggle={toggleGroup}
                      onToggleFavorite={onToggleFavorite}
                    />
                  ))}

                  {matchingModelCount === 0 ? (
                    <p className="model-explorer__empty" role="status">
                      No models match your search.
                    </p>
                  ) : null}
                </div>

                <footer className="model-explorer__footer">
                  <span>Arrow keys move through results.</span>
                  <span>Enter selects. Escape closes.</span>
                </footer>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
