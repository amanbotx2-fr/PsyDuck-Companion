import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  createModelExplorerCatalog,
  getRecommendedModels,
  groupModelExplorerCatalog,
  resolveReferencedModels,
  searchModelExplorerCatalog,
  type ModelExplorerEntry,
  type ModelExplorerGroup,
  type ModelExplorerSource,
  type ModelProviderGroup,
  type RecommendedModel,
} from '../../shared/modelMetadata';
import {
  MAXIMUM_RECENT_AI_MODELS_PER_PROVIDER,
  type AiModelExplorerSettings,
  type AiProvider,
} from '../../shared/settings';

export interface ModelExplorerController {
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly totalModelCount: number;
  readonly matchingModelCount: number;
  readonly favorites: readonly ModelExplorerEntry[];
  readonly recent: readonly ModelExplorerEntry[];
  readonly recommended: readonly RecommendedModel[];
  readonly groups: readonly ModelExplorerGroup[];
  readonly expandedGroups: ReadonlySet<ModelProviderGroup>;
  readonly activeModelId: string | null;
  readonly selectedModel: ModelExplorerEntry | null;
  readonly visibleModels: readonly ModelExplorerEntry[];
  readonly toggleGroup: (group: ModelProviderGroup) => void;
  readonly moveActiveModel: (direction: 1 | -1) => void;
  readonly setActiveModelId: (modelId: string) => void;
}

interface UseModelExplorerOptions {
  readonly models: readonly ModelExplorerSource[];
  readonly provider: AiProvider;
  readonly selectedModelId: string;
  readonly preferences: AiModelExplorerSettings;
  readonly open: boolean;
}

const deduplicateModels = (
  sections: readonly (readonly ModelExplorerEntry[])[],
): readonly ModelExplorerEntry[] => {
  const modelIds = new Set<string>();
  const models: ModelExplorerEntry[] = [];

  for (const section of sections) {
    for (const model of section) {
      if (modelIds.has(model.id)) {
        continue;
      }

      modelIds.add(model.id);
      models.push(model);
    }
  }

  return models;
};

export function useModelExplorer({
  models,
  provider,
  selectedModelId,
  preferences,
  open,
}: UseModelExplorerOptions): ModelExplorerController {
  const [query, setQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<
    ReadonlySet<ModelProviderGroup>
  >(() => new Set());
  const [activeModelId, setActiveModelIdState] = useState<string | null>(
    null,
  );
  const catalog = useMemo(
    () => createModelExplorerCatalog(models, provider),
    [models, provider],
  );
  const filteredCatalog = useMemo(
    () => searchModelExplorerCatalog(catalog, query),
    [catalog, query],
  );
  const selectedModel = useMemo(
    () => catalog.find((model) => model.id === selectedModelId) ?? null,
    [catalog, selectedModelId],
  );
  const favorites = useMemo(
    () =>
      resolveReferencedModels(
        filteredCatalog,
        preferences.favorites,
        provider,
      ),
    [filteredCatalog, preferences.favorites, provider],
  );
  const favoriteIds = useMemo(
    () => new Set(favorites.map((model) => model.id)),
    [favorites],
  );
  const recent = useMemo(
    () =>
      resolveReferencedModels(
        filteredCatalog,
        preferences.recent,
        provider,
        MAXIMUM_RECENT_AI_MODELS_PER_PROVIDER,
      ).filter((model) => !favoriteIds.has(model.id)),
    [favoriteIds, filteredCatalog, preferences.recent, provider],
  );
  const recentIds = useMemo(
    () => new Set(recent.map((model) => model.id)),
    [recent],
  );
  const recommended = useMemo(
    () =>
      getRecommendedModels(filteredCatalog).filter(
        ({ model }) =>
          !favoriteIds.has(model.id) && !recentIds.has(model.id),
      ),
    [favoriteIds, filteredCatalog, recentIds],
  );
  const promotedModelIds = useMemo(
    () =>
      new Set([
        ...favoriteIds,
        ...recentIds,
        ...recommended.map(({ model }) => model.id),
      ]),
    [favoriteIds, recentIds, recommended],
  );
  const groups = useMemo(
    () =>
      groupModelExplorerCatalog(
        filteredCatalog.filter(
          (model) => !promotedModelIds.has(model.id),
        ),
      ),
    [filteredCatalog, promotedModelIds],
  );
  const queryIsActive = query.trim().length > 0;
  const expandedGroupModels = useMemo(
    () =>
      groups.flatMap((group) =>
        queryIsActive || expandedGroups.has(group.name)
          ? group.models
          : [],
      ),
    [expandedGroups, groups, queryIsActive],
  );
  const visibleModels = useMemo(
    () =>
      deduplicateModels([
        favorites,
        recent,
        recommended.map(({ model }) => model),
        expandedGroupModels,
      ]),
    [expandedGroupModels, favorites, recent, recommended],
  );

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveModelIdState(null);
      return;
    }

    const initialGroup =
      selectedModel?.providerGroup ?? groups[0]?.name ?? null;

    setExpandedGroups(
      initialGroup === null ? new Set() : new Set([initialGroup]),
    );
  }, [open, provider, selectedModel?.providerGroup]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveModelIdState((currentModelId) => {
      if (
        currentModelId !== null &&
        visibleModels.some((model) => model.id === currentModelId)
      ) {
        return currentModelId;
      }

      if (
        selectedModel !== null &&
        visibleModels.some((model) => model.id === selectedModel.id)
      ) {
        return selectedModel.id;
      }

      return visibleModels[0]?.id ?? null;
    });
  }, [open, selectedModel, visibleModels]);

  const toggleGroup = useCallback((group: ModelProviderGroup): void => {
    setExpandedGroups((currentGroups) => {
      const nextGroups = new Set(currentGroups);

      if (nextGroups.has(group)) {
        nextGroups.delete(group);
      } else {
        nextGroups.add(group);
      }

      return nextGroups;
    });
  }, []);

  const moveActiveModel = useCallback(
    (direction: 1 | -1): void => {
      if (visibleModels.length === 0) {
        return;
      }

      setActiveModelIdState((currentModelId) => {
        const currentIndex = visibleModels.findIndex(
          (model) => model.id === currentModelId,
        );
        const nextIndex =
          currentIndex < 0
            ? direction === 1
              ? 0
              : visibleModels.length - 1
            : (currentIndex + direction + visibleModels.length) %
              visibleModels.length;

        return visibleModels[nextIndex]?.id ?? null;
      });
    },
    [visibleModels],
  );

  const setActiveModelId = useCallback((modelId: string): void => {
    setActiveModelIdState(modelId);
  }, []);

  return {
    query,
    setQuery,
    totalModelCount: catalog.length,
    matchingModelCount: filteredCatalog.length,
    favorites,
    recent,
    recommended,
    groups,
    expandedGroups,
    activeModelId,
    selectedModel,
    visibleModels,
    toggleGroup,
    moveActiveModel,
    setActiveModelId,
  };
}
