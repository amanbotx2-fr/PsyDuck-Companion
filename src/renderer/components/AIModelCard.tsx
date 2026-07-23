import { memo } from 'react';

import {
  formatModelContextLength,
  getModelBadgesWithRecommendation,
  type ModelExplorerEntry,
  type ModelRecommendationTier,
} from '../../shared/modelMetadata';

interface AIModelCardProps {
  readonly active: boolean;
  readonly favorite: boolean;
  readonly model: ModelExplorerEntry;
  readonly optionId: string;
  readonly recommendationReason?: string;
  readonly recommendationTier?: ModelRecommendationTier;
  readonly selected: boolean;
  readonly onActivate: (modelId: string) => void;
  readonly onSelect: (modelId: string) => void;
  readonly onToggleFavorite: (modelId: string) => void;
}

function AIModelCardComponent({
  active,
  favorite,
  model,
  optionId,
  recommendationReason,
  recommendationTier,
  selected,
  onActivate,
  onSelect,
  onToggleFavorite,
}: AIModelCardProps) {
  const contextLabel =
    model.contextLength === undefined
      ? ''
      : formatModelContextLength(model.contextLength);
  const badges = getModelBadgesWithRecommendation(
    model,
    recommendationTier,
  );

  return (
    <div
      className="model-card"
      data-active={active}
      data-selected={selected}
      onMouseEnter={() => {
        onActivate(model.id);
      }}
    >
      <button
        className="model-card__selection"
        id={optionId}
        type="button"
        role="option"
        aria-selected={selected}
        tabIndex={-1}
        onClick={() => {
          onSelect(model.id);
        }}
      >
        <span className="model-card__heading">
          <span className="model-card__name">{model.displayName}</span>
          {selected ? (
            <span className="model-card__selected">Selected</span>
          ) : null}
        </span>
        <span className="model-card__id">{model.id}</span>
        {model.description === undefined ? null : (
          <span className="model-card__description">
            {model.description}
          </span>
        )}
        <span className="model-card__metadata">
          <span>{model.providerLabel}</span>
          {contextLabel.length === 0 ? null : <span>{contextLabel}</span>}
          {model.pricingLabel === undefined ? null : (
            <span>{model.pricingLabel}</span>
          )}
          {recommendationReason === undefined ? null : (
            <span>{recommendationReason}</span>
          )}
        </span>
        {model.tags.length === 0 && badges.length === 0 ? null : (
          <span className="model-card__labels" aria-label="Model metadata">
            {badges.map((badge) => (
              <span
                className="model-badge"
                data-badge={badge.toLocaleLowerCase()}
                key={badge}
              >
                {badge}
              </span>
            ))}
            {model.tags.map((tag) => (
              <span className="model-tag" key={tag}>
                {tag}
              </span>
            ))}
          </span>
        )}
      </button>
      <button
        className="model-card__favorite"
        type="button"
        aria-label={
          favorite
            ? `Remove ${model.displayName} from favorites`
            : `Add ${model.displayName} to favorites`
        }
        aria-pressed={favorite}
        onClick={() => {
          onToggleFavorite(model.id);
        }}
      >
        {favorite ? 'Favorited' : 'Favorite'}
      </button>
    </div>
  );
}

export const AIModelCard = memo(AIModelCardComponent);
