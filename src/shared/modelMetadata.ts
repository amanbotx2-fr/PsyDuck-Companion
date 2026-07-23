import type {
  AiModelExplorerSettings,
  AiModelReference,
  AiProvider,
} from './settings';
import {
  MAXIMUM_FAVORITE_AI_MODELS,
  MAXIMUM_RECENT_AI_MODELS_PER_PROVIDER,
} from './settings';

export const MODEL_PROVIDER_GROUPS = [
  'OpenAI',
  'Anthropic',
  'Google',
  'Meta',
  'DeepSeek',
  'Qwen',
  'Mistral',
  'xAI',
  'Microsoft',
  'Amazon',
  'Ollama',
  'Other',
] as const;

export type ModelProviderGroup = (typeof MODEL_PROVIDER_GROUPS)[number];
export type ModelCapability = 'vision' | 'reasoning';
export type ModelBadge =
  | 'FREE'
  | 'PAID'
  | 'LOCAL'
  | 'VISION'
  | 'REASONING';
export type ModelRecommendationTier = 'free' | 'paid';

export interface ModelExplorerSource {
  readonly id: string;
  readonly displayName?: string;
  readonly aliases?: readonly string[];
  readonly description?: string;
  readonly contextLength?: number;
  readonly pricingLabel?: string;
  readonly tags?: readonly string[];
  readonly capabilities?: readonly ModelCapability[];
}

export interface ModelExplorerEntry {
  readonly id: string;
  readonly displayName: string;
  readonly sourceProvider: AiProvider;
  readonly providerGroup: ModelProviderGroup;
  readonly providerLabel: string;
  readonly aliases: readonly string[];
  readonly badges: readonly ModelBadge[];
  readonly description?: string;
  readonly contextLength?: number;
  readonly pricingLabel?: string;
  readonly tags: readonly string[];
  readonly searchText: string;
}

export interface ModelExplorerGroup {
  readonly name: ModelProviderGroup;
  readonly models: readonly ModelExplorerEntry[];
}

export interface RecommendedModel {
  readonly model: ModelExplorerEntry;
  readonly tier: ModelRecommendationTier;
  readonly reason: string;
}

interface ModelRecommendationRule {
  readonly id: string;
  readonly tier: ModelRecommendationTier;
  readonly reason: string;
  readonly preferredIds: readonly string[];
  readonly matches: (model: ModelExplorerEntry) => boolean;
}

const GROUP_BY_NAMESPACE: Readonly<Record<string, ModelProviderGroup>> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  'google-ai-studio': 'Google',
  meta: 'Meta',
  'meta-llama': 'Meta',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  mistral: 'Mistral',
  mistralai: 'Mistral',
  xai: 'xAI',
  'x-ai': 'xAI',
  grok: 'xAI',
  microsoft: 'Microsoft',
  amazon: 'Amazon',
  'amazon-nova': 'Amazon',
};

const GROUP_BY_PROVIDER: Readonly<
  Partial<Record<AiProvider, ModelProviderGroup>>
> = {
  openai: 'OpenAI',
  gemini: 'Google',
  grok: 'xAI',
  ollama: 'Ollama',
};

const PROVIDER_LABELS: Readonly<Record<AiProvider, string>> = {
  openai: 'OpenAI',
  gemini: 'Google',
  grok: 'xAI',
  ollama: 'Ollama',
  custom: 'Custom',
};

const TOKEN_LABELS: Readonly<Record<string, string>> = {
  ai: 'AI',
  api: 'API',
  claude: 'Claude',
  deepseek: 'DeepSeek',
  gemini: 'Gemini',
  gemma: 'Gemma',
  gpt: 'GPT',
  it: 'IT',
  llm: 'LLM',
  llama: 'Llama',
  mini: 'Mini',
  mistral: 'Mistral',
  qwen: 'Qwen',
  r1: 'R1',
  vl: 'VL',
};

const GROUP_ALIASES: Readonly<Record<ModelProviderGroup, readonly string[]>> = {
  OpenAI: ['OpenAI'],
  Anthropic: ['Anthropic'],
  Google: ['Google'],
  Meta: ['Meta'],
  DeepSeek: ['DeepSeek'],
  Qwen: ['Qwen'],
  Mistral: ['Mistral', 'Mistral AI'],
  xAI: ['xAI', 'x AI'],
  Microsoft: ['Microsoft'],
  Amazon: ['Amazon', 'AWS'],
  Ollama: ['Ollama', 'local'],
  Other: ['Other'],
};

const normalizeForSearch = (value: string): string =>
  value
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const titleCaseToken = (token: string): string => {
  const normalizedToken = token.toLocaleLowerCase();
  const knownLabel = TOKEN_LABELS[normalizedToken];

  if (knownLabel !== undefined) {
    return knownLabel;
  }

  if (/^\d+[a-z]$/i.test(token)) {
    return token.toUpperCase();
  }

  return normalizedToken.length === 0
    ? ''
    : `${normalizedToken[0]?.toLocaleUpperCase()}${normalizedToken.slice(1)}`;
};

export const getModelDisplayName = (model: ModelExplorerSource): string => {
  const providedName = model.displayName?.trim();

  if (providedName !== undefined && providedName.length > 0) {
    return providedName;
  }

  const modelName =
    model.id.split('/').at(-1)?.replace(/:free$/i, '') ?? model.id;
  const tokens = modelName
    .split(/[-_:]+/)
    .map(titleCaseToken)
    .filter((token) => token.length > 0);

  return tokens.length > 0 ? tokens.join(' ') : model.id;
};

const getModelNamespace = (modelId: string): string | null => {
  const separatorIndex = modelId.indexOf('/');

  return separatorIndex > 0
    ? modelId.slice(0, separatorIndex).toLocaleLowerCase()
    : null;
};

export const getModelProviderGroup = (
  modelId: string,
  sourceProvider: AiProvider,
): ModelProviderGroup => {
  const namespace = getModelNamespace(modelId);
  const namespaceGroup =
    namespace === null ? undefined : GROUP_BY_NAMESPACE[namespace];

  return (
    namespaceGroup ??
    GROUP_BY_PROVIDER[sourceProvider] ??
    'Other'
  );
};

const getProviderLabel = (
  modelId: string,
  sourceProvider: AiProvider,
  group: ModelProviderGroup,
): string => {
  const namespace = getModelNamespace(modelId);

  if (namespace !== null) {
    return GROUP_BY_NAMESPACE[namespace] ?? titleCaseToken(namespace);
  }

  return group === 'Other' ? PROVIDER_LABELS[sourceProvider] : group;
};

const getModelBadges = (
  model: ModelExplorerSource,
  sourceProvider: AiProvider,
): readonly ModelBadge[] => {
  const normalizedId = model.id.toLocaleLowerCase();
  const normalizedPricing = model.pricingLabel?.toLocaleLowerCase() ?? '';
  const capabilities = new Set(model.capabilities ?? []);
  const badges: ModelBadge[] = [];

  if (normalizedId.endsWith(':free') || normalizedPricing === 'free') {
    badges.push('FREE');
  } else if (normalizedPricing === 'paid') {
    badges.push('PAID');
  }

  if (sourceProvider === 'ollama') {
    badges.push('LOCAL');
  }

  if (
    capabilities.has('vision') ||
    /(?:^|[/:_-])vision(?:$|[/:_-])/.test(normalizedId)
  ) {
    badges.push('VISION');
  }

  if (
    capabilities.has('reasoning') ||
    /(?:^|[/:_-])reasoning(?:$|[/:_-])/.test(normalizedId) ||
    /(?:^|[/:_-])deepseek-r1(?:$|[/:_-])/.test(normalizedId)
  ) {
    badges.push('REASONING');
  }

  return badges;
};

const getModelAliases = (
  model: ModelExplorerSource,
  group: ModelProviderGroup,
  displayName: string,
): readonly string[] => {
  const leafName = model.id.split('/').at(-1) ?? model.id;
  const modelDescriptor = `${model.id} ${displayName}`.toLocaleLowerCase();
  const familyAliases = [
    ...(modelDescriptor.includes('gpt') ? ['GPT', 'ChatGPT'] : []),
    ...(modelDescriptor.includes('claude') ? ['Claude'] : []),
    ...(modelDescriptor.includes('gemini') ? ['Gemini'] : []),
    ...(modelDescriptor.includes('gemma') ? ['Gemma'] : []),
    ...(modelDescriptor.includes('llama') ? ['Llama'] : []),
    ...(modelDescriptor.includes('qwen') ? ['Alibaba'] : []),
    ...(modelDescriptor.includes('grok') ? ['Grok'] : []),
  ];
  const candidates = [
    displayName,
    leafName,
    ...GROUP_ALIASES[group],
    ...familyAliases,
    ...(model.aliases ?? []),
  ];
  const aliases: string[] = [];
  const seenAliases = new Set<string>();

  for (const candidate of candidates) {
    const normalizedAlias = candidate.trim();
    const aliasKey = normalizeForSearch(normalizedAlias);

    if (normalizedAlias.length === 0 || seenAliases.has(aliasKey)) {
      continue;
    }

    seenAliases.add(aliasKey);
    aliases.push(normalizedAlias);
  }

  return aliases;
};

export const createModelExplorerCatalog = (
  models: readonly ModelExplorerSource[],
  sourceProvider: AiProvider,
): readonly ModelExplorerEntry[] => {
  const catalog: ModelExplorerEntry[] = [];
  const seenModelIds = new Set<string>();

  for (const model of models) {
    const id = model.id.trim();

    if (id.length === 0 || seenModelIds.has(id)) {
      continue;
    }

    seenModelIds.add(id);
    const normalizedModel: ModelExplorerSource = { ...model, id };
    const providerGroup = getModelProviderGroup(id, sourceProvider);
    const providerLabel = getProviderLabel(
      id,
      sourceProvider,
      providerGroup,
    );
    const displayName = getModelDisplayName(normalizedModel);
    const aliases = getModelAliases(
      normalizedModel,
      providerGroup,
      displayName,
    );
    const tags = (model.tags ?? [])
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .slice(0, 8);
    const searchText = normalizeForSearch(
      [
        id,
        displayName,
        providerGroup,
        providerLabel,
        ...aliases,
        ...tags,
      ].join(' '),
    );

    catalog.push({
      id,
      displayName,
      sourceProvider,
      providerGroup,
      providerLabel,
      aliases,
      badges: getModelBadges(normalizedModel, sourceProvider),
      ...(model.description === undefined
        ? {}
        : { description: model.description }),
      ...(model.contextLength === undefined
        ? {}
        : { contextLength: model.contextLength }),
      ...(model.pricingLabel === undefined
        ? {}
        : { pricingLabel: model.pricingLabel }),
      tags,
      searchText,
    });
  }

  return catalog.sort((left, right) => {
    const groupDifference =
      MODEL_PROVIDER_GROUPS.indexOf(left.providerGroup) -
      MODEL_PROVIDER_GROUPS.indexOf(right.providerGroup);

    return (
      groupDifference ||
      left.displayName.localeCompare(right.displayName) ||
      left.id.localeCompare(right.id)
    );
  });
};

export const searchModelExplorerCatalog = (
  catalog: readonly ModelExplorerEntry[],
  query: string,
): readonly ModelExplorerEntry[] => {
  const queryTokens = normalizeForSearch(query)
    .split(' ')
    .filter((token) => token.length > 0);

  return queryTokens.length === 0
    ? catalog
    : catalog.filter((model) =>
        queryTokens.every((token) => model.searchText.includes(token)),
      );
};

export const groupModelExplorerCatalog = (
  catalog: readonly ModelExplorerEntry[],
): readonly ModelExplorerGroup[] => {
  const modelsByGroup = new Map<
    ModelProviderGroup,
    ModelExplorerEntry[]
  >();

  for (const model of catalog) {
    const groupModels = modelsByGroup.get(model.providerGroup);

    if (groupModels === undefined) {
      modelsByGroup.set(model.providerGroup, [model]);
    } else {
      groupModels.push(model);
    }
  }

  return MODEL_PROVIDER_GROUPS.flatMap((name) => {
    const models = modelsByGroup.get(name);
    return models === undefined ? [] : [{ name, models }];
  });
};

export const MODEL_RECOMMENDATION_RULES: readonly ModelRecommendationRule[] = [
  {
    id: 'google-gemma-free',
    tier: 'free',
    reason: 'Google Gemma',
    preferredIds: [
      'google/gemma-3-27b-it:free',
      'google/gemma-3-12b-it:free',
    ],
    matches: (model) =>
      model.providerGroup === 'Google' &&
      model.id.toLocaleLowerCase().includes('gemma') &&
      model.id.toLocaleLowerCase().endsWith(':free'),
  },
  {
    id: 'qwen-free',
    tier: 'free',
    reason: 'Qwen',
    preferredIds: [
      'qwen/qwen3-235b-a22b:free',
      'qwen/qwen3-32b:free',
    ],
    matches: (model) =>
      model.providerGroup === 'Qwen' &&
      model.id.toLocaleLowerCase().endsWith(':free'),
  },
  {
    id: 'deepseek-free',
    tier: 'free',
    reason: 'DeepSeek',
    preferredIds: [
      'deepseek/deepseek-r1-0528:free',
      'deepseek/deepseek-r1:free',
    ],
    matches: (model) =>
      model.providerGroup === 'DeepSeek' &&
      model.id.toLocaleLowerCase().endsWith(':free'),
  },
  {
    id: 'gpt-4.1-mini',
    tier: 'paid',
    reason: 'GPT-4.1 Mini',
    preferredIds: ['openai/gpt-4.1-mini', 'gpt-4.1-mini'],
    matches: (model) =>
      (model.sourceProvider === 'openai' ||
        model.id.toLocaleLowerCase().startsWith('openai/')) &&
      model.id.toLocaleLowerCase().includes('gpt-4.1-mini'),
  },
  {
    id: 'claude-sonnet',
    tier: 'paid',
    reason: 'Claude Sonnet',
    preferredIds: [
      'anthropic/claude-sonnet-4',
      'anthropic/claude-3.7-sonnet',
    ],
    matches: (model) =>
      model.id.toLocaleLowerCase().startsWith('anthropic/') &&
      model.id.toLocaleLowerCase().includes('sonnet'),
  },
  {
    id: 'gemini-flash',
    tier: 'paid',
    reason: 'Gemini Flash',
    preferredIds: [
      'google/gemini-2.5-flash',
      'gemini-2.5-flash',
    ],
    matches: (model) =>
      (model.sourceProvider === 'gemini' ||
        model.id.toLocaleLowerCase().startsWith('google/')) &&
      model.id.toLocaleLowerCase().includes('gemini') &&
      model.id.toLocaleLowerCase().includes('flash') &&
      !model.id.toLocaleLowerCase().endsWith(':free'),
  },
];

export const getRecommendedModels = (
  catalog: readonly ModelExplorerEntry[],
): readonly RecommendedModel[] => {
  const modelsById = new Map(
    catalog.map((model) => [model.id.toLocaleLowerCase(), model]),
  );
  const recommendations: RecommendedModel[] = [];
  const selectedModelIds = new Set<string>();

  for (const rule of MODEL_RECOMMENDATION_RULES) {
    const preferredModel = rule.preferredIds
      .map((id) => modelsById.get(id.toLocaleLowerCase()))
      .find((model) => model !== undefined && rule.matches(model));
    const model =
      preferredModel ?? catalog.find((candidate) => rule.matches(candidate));

    if (model === undefined || selectedModelIds.has(model.id)) {
      continue;
    }

    selectedModelIds.add(model.id);
    recommendations.push({
      model,
      tier: rule.tier,
      reason: rule.reason,
    });
  }

  return recommendations;
};

const isSameModelReference = (
  left: AiModelReference,
  right: AiModelReference,
): boolean =>
  left.provider === right.provider && left.modelId === right.modelId;

export const createModelReference = (
  provider: AiProvider,
  modelId: string,
): AiModelReference => ({
  provider,
  modelId: modelId.trim(),
});

export const toggleFavoriteModel = (
  settings: AiModelExplorerSettings,
  reference: AiModelReference,
): AiModelExplorerSettings => {
  const isFavorite = settings.favorites.some((favorite) =>
    isSameModelReference(favorite, reference),
  );
  const favorites = isFavorite
    ? settings.favorites.filter(
        (favorite) => !isSameModelReference(favorite, reference),
      )
    : settings.favorites.length >= MAXIMUM_FAVORITE_AI_MODELS
      ? settings.favorites
      : [reference, ...settings.favorites];

  return {
    favorites: favorites.map((favorite) => ({ ...favorite })),
    recent: settings.recent.map((recent) => ({ ...recent })),
  };
};

export const recordRecentModel = (
  settings: AiModelExplorerSettings,
  reference: AiModelReference,
): AiModelExplorerSettings => {
  const currentProviderModels = [
    reference,
    ...settings.recent.filter(
      (recent) =>
        recent.provider === reference.provider &&
        !isSameModelReference(recent, reference),
    ),
  ].slice(0, MAXIMUM_RECENT_AI_MODELS_PER_PROVIDER);
  const otherProviderModels = settings.recent.filter(
    (recent) => recent.provider !== reference.provider,
  );

  return {
    favorites: settings.favorites.map((favorite) => ({ ...favorite })),
    recent: [...currentProviderModels, ...otherProviderModels].map(
      (recent) => ({ ...recent }),
    ),
  };
};

export const resolveReferencedModels = (
  catalog: readonly ModelExplorerEntry[],
  references: readonly AiModelReference[],
  provider: AiProvider,
  maximum?: number,
): readonly ModelExplorerEntry[] => {
  const modelsById = new Map(catalog.map((model) => [model.id, model]));
  const models = references.flatMap((reference) => {
    const model =
      reference.provider === provider
        ? modelsById.get(reference.modelId)
        : undefined;
    return model === undefined ? [] : [model];
  });

  return maximum === undefined ? models : models.slice(0, maximum);
};

export const getModelBadgesWithRecommendation = (
  model: ModelExplorerEntry,
  tier?: ModelRecommendationTier,
): readonly ModelBadge[] => {
  const badges = new Set<ModelBadge>(model.badges);

  if (tier === 'free') {
    badges.add('FREE');
  } else if (tier === 'paid') {
    badges.add('PAID');
  }

  return [...badges];
};

export const formatModelContextLength = (contextLength: number): string => {
  if (!Number.isFinite(contextLength) || contextLength <= 0) {
    return '';
  }

  if (contextLength >= 1_000_000) {
    return `${(contextLength / 1_000_000).toLocaleString(undefined, {
      maximumFractionDigits: 1,
    })}M context`;
  }

  if (contextLength >= 1_000) {
    return `${Math.round(contextLength / 1_000).toLocaleString()}K context`;
  }

  return `${Math.round(contextLength).toLocaleString()} context`;
};
