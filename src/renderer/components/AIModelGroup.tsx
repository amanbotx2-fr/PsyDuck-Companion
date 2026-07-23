import { memo } from 'react';

import type {
  ModelExplorerGroup,
  ModelProviderGroup,
} from '../../shared/modelMetadata';
import { AIModelCard } from './AIModelCard';

interface AIModelGroupProps {
  readonly activeModelId: string | null;
  readonly collapsible: boolean;
  readonly expanded: boolean;
  readonly favoriteModelIds: ReadonlySet<string>;
  readonly group: ModelExplorerGroup;
  readonly selectedModelId: string;
  readonly getOptionId: (modelId: string) => string;
  readonly onActivate: (modelId: string) => void;
  readonly onSelect: (modelId: string) => void;
  readonly onToggle: (group: ModelProviderGroup) => void;
  readonly onToggleFavorite: (modelId: string) => void;
}

function AIModelGroupComponent({
  activeModelId,
  collapsible,
  expanded,
  favoriteModelIds,
  group,
  selectedModelId,
  getOptionId,
  onActivate,
  onSelect,
  onToggle,
  onToggleFavorite,
}: AIModelGroupProps) {
  const headingId = `model-group-${group.name
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <section className="model-group" aria-labelledby={headingId}>
      <button
        className="model-group__toggle"
        id={headingId}
        type="button"
        aria-expanded={expanded}
        disabled={!collapsible}
        onClick={() => {
          if (collapsible) {
            onToggle(group.name);
          }
        }}
      >
        <span>{group.name}</span>
        <span className="model-group__summary">
          {group.models.length.toLocaleString()}
          <span aria-hidden="true"> · </span>
          {collapsible ? (expanded ? 'Hide' : 'Show') : 'Matches'}
        </span>
      </button>
      {expanded ? (
        <div className="model-group__models">
          {group.models.map((model) => (
            <AIModelCard
              key={model.id}
              model={model}
              optionId={getOptionId(model.id)}
              active={activeModelId === model.id}
              selected={selectedModelId === model.id}
              favorite={favoriteModelIds.has(model.id)}
              onActivate={onActivate}
              onSelect={onSelect}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export const AIModelGroup = memo(AIModelGroupComponent);
