import {
  cloneReminder,
  parseStoredReminders,
  type Reminder,
} from './reminders';

export const WATER_REMINDER_INTERVAL_OPTIONS = [
  15,
  30,
  45,
  60,
  90,
  120,
] as const;

export type WaterReminderInterval =
  (typeof WATER_REMINDER_INTERVAL_OPTIONS)[number];

export const AI_PROVIDER_OPTIONS = [
  {
    id: 'openai',
    label: 'OpenAI',
  },
  {
    id: 'gemini',
    label: 'Gemini',
  },
  {
    id: 'grok',
    label: 'Grok',
  },
  {
    id: 'ollama',
    label: 'Ollama',
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI Compatible)',
  },
] as const;

export type AiProvider = (typeof AI_PROVIDER_OPTIONS)[number]['id'];
export type AiProviderSelection = AiProvider | '';

export const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';
export const DEFAULT_CUSTOM_AI_BASE_URL = '';
export const DEFAULT_USER_NAME = 'Friend';
export const MAXIMUM_USER_NAME_LENGTH = 30;
export const MAXIMUM_STICKY_MESSAGE_LENGTH = 120;
export const MAXIMUM_FAVORITE_AI_MODELS = 512;
export const MAXIMUM_RECENT_AI_MODELS_PER_PROVIDER = 5;

export const normalizeUserName = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 &&
    normalizedValue.length <= MAXIMUM_USER_NAME_LENGTH
    ? normalizedValue
    : null;
};

export const normalizeStickyMessage = (
  value: unknown,
): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 &&
    normalizedValue.length <= MAXIMUM_STICKY_MESSAGE_LENGTH
    ? normalizedValue
    : null;
};

export const isAiProvider = (value: unknown): value is AiProvider =>
  typeof value === 'string' &&
  AI_PROVIDER_OPTIONS.some((provider) => provider.id === value);

export const isValidAiEndpoint = (value: string): boolean => {
  try {
    const endpoint = new URL(value);

    return (
      (endpoint.protocol === 'http:' || endpoint.protocol === 'https:') &&
      endpoint.username.length === 0 &&
      endpoint.password.length === 0 &&
      endpoint.search.length === 0 &&
      endpoint.hash.length === 0
    );
  } catch {
    return false;
  }
};

const parseIPv4Address = (hostname: string): readonly number[] | null => {
  const segments = hostname.split('.');

  if (segments.length !== 4) {
    return null;
  }

  const octets = segments.map((segment) => {
    if (!/^(?:0|[1-9]\d{0,2})$/.test(segment)) {
      return Number.NaN;
    }

    return Number(segment);
  });

  return octets.every((octet) => Number.isInteger(octet) && octet <= 255)
    ? octets
    : null;
};

const isPrivateLanIPv4Address = (hostname: string): boolean => {
  const octets = parseIPv4Address(hostname);

  if (octets === null) {
    return false;
  }

  const first = octets[0];
  const second = octets[1];

  return (
    (first === 10) ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
};

const isPrivateLanIPv6Address = (hostname: string): boolean => {
  const normalizedHostname = hostname
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .toLowerCase();
  const firstSegment = normalizedHostname.split(':')[0];

  if (firstSegment === undefined || !/^[0-9a-f]{1,4}$/.test(firstSegment)) {
    return false;
  }

  const firstValue = Number.parseInt(firstSegment, 16);
  return (firstValue & 0xfe00) === 0xfc00;
};

const isAllowedInsecureCustomAiHost = (hostname: string): boolean => {
  const normalizedHostname = hostname.toLowerCase();

  return (
    normalizedHostname === 'localhost' ||
    normalizedHostname === '127.0.0.1' ||
    normalizedHostname === '[::1]' ||
    normalizedHostname === '::1' ||
    isPrivateLanIPv4Address(normalizedHostname) ||
    isPrivateLanIPv6Address(normalizedHostname)
  );
};

export const normalizeOpenAICompatibleBaseUrl = (
  value: unknown,
): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    return null;
  }

  try {
    const baseUrl = new URL(normalizedValue);

    if (
      (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') ||
      baseUrl.username.length > 0 ||
      baseUrl.password.length > 0 ||
      baseUrl.search.length > 0 ||
      baseUrl.hash.length > 0 ||
      (baseUrl.protocol === 'http:' &&
        !isAllowedInsecureCustomAiHost(baseUrl.hostname))
    ) {
      return null;
    }

    const pathname =
      baseUrl.pathname === '/'
        ? ''
        : baseUrl.pathname.replace(/\/+$/, '');

    return `${baseUrl.protocol}//${baseUrl.host}${pathname}`;
  } catch {
    return null;
  }
};

export const isValidOpenAICompatibleBaseUrl = (value: string): boolean =>
  normalizeOpenAICompatibleBaseUrl(value) !== null;

export interface GeneralSettings {
  readonly alwaysOnTop: boolean;
  readonly launchAtStartup: boolean;
  readonly eyeTracking: boolean;
}

export interface WaterSettings {
  readonly enabled: boolean;
  readonly interval: WaterReminderInterval;
}

export interface UpdateSettings {
  readonly automatic: boolean;
}

export interface AiSettings {
  readonly enabled: boolean;
  readonly provider: AiProviderSelection;
  readonly model: string;
  readonly apiKeyConfigured: boolean;
  readonly endpoint: string;
  readonly baseUrl: string;
}

export interface AiModelReference {
  readonly provider: AiProvider;
  readonly modelId: string;
}

export interface AiModelExplorerSettings {
  readonly favorites: readonly AiModelReference[];
  readonly recent: readonly AiModelReference[];
}

export interface AppSettings {
  readonly userName: string;
  readonly stickyMessage: string | null;
  readonly reminders: readonly Reminder[];
  readonly general: GeneralSettings;
  readonly water: WaterSettings;
  readonly updates: UpdateSettings;
  readonly ai: AiSettings;
  readonly aiModelExplorer: AiModelExplorerSettings;
}

export interface RuntimeSettings {
  readonly userName: string;
  readonly stickyMessage: string | null;
  readonly general: GeneralSettings;
  readonly water: WaterSettings;
}

export interface PreferencesAiSettings {
  readonly enabled: boolean;
  readonly provider: AiProviderSelection;
  readonly model: string;
  readonly apiKeyConfigured: boolean;
  readonly endpoint: string;
  readonly baseUrl: string;
}

// This DTO is restricted to the Preferences window. Credentials are redacted.
export interface PreferencesSettings {
  readonly userName: string;
  readonly general: GeneralSettings;
  readonly water: WaterSettings;
  readonly updates: UpdateSettings;
  readonly ai: PreferencesAiSettings;
  readonly aiModelExplorer: AiModelExplorerSettings;
}

export interface GeneralSettingsPatch {
  readonly alwaysOnTop?: boolean;
  readonly launchAtStartup?: boolean;
  readonly eyeTracking?: boolean;
}

export interface WaterSettingsPatch {
  readonly enabled?: boolean;
  readonly interval?: WaterReminderInterval;
}

export interface UpdateSettingsPatch {
  readonly automatic?: boolean;
}

export interface AiSettingsPatch {
  readonly enabled?: boolean;
  readonly provider?: AiProviderSelection;
  readonly model?: string;
  readonly endpoint?: string;
  readonly baseUrl?: string;
}

export interface AiModelExplorerSettingsPatch {
  readonly favorites?: readonly AiModelReference[];
  readonly recent?: readonly AiModelReference[];
}

export interface SettingsPatch {
  readonly userName?: string;
  readonly stickyMessage?: string | null;
  readonly reminders?: readonly Reminder[];
  readonly general?: GeneralSettingsPatch;
  readonly water?: WaterSettingsPatch;
  readonly updates?: UpdateSettingsPatch;
  readonly ai?: AiSettingsPatch;
  readonly aiModelExplorer?: AiModelExplorerSettingsPatch;
}

export interface PreferencesSettingsPatch {
  readonly general?: GeneralSettingsPatch;
  readonly water?: WaterSettingsPatch;
  readonly updates?: UpdateSettingsPatch;
  readonly aiModelExplorer?: AiModelExplorerSettingsPatch;
}

// Credentials may travel only from Preferences to main through the dedicated
// configuration capability. Main never returns this object to a renderer.
export interface AiConfigurationUpdate extends AiSettingsPatch {
  readonly apiKey?: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  userName: DEFAULT_USER_NAME,
  stickyMessage: null,
  reminders: [],
  general: {
    alwaysOnTop: true,
    launchAtStartup: false,
    eyeTracking: true,
  },
  water: {
    enabled: true,
    interval: 30,
  },
  updates: {
    automatic: false,
  },
  ai: {
    enabled: false,
    provider: '',
    model: '',
    apiKeyConfigured: false,
    endpoint: DEFAULT_OLLAMA_ENDPOINT,
    baseUrl: DEFAULT_CUSTOM_AI_BASE_URL,
  },
  aiModelExplorer: {
    favorites: [],
    recent: [],
  },
};

const GENERAL_SETTING_KEYS = [
  'alwaysOnTop',
  'launchAtStartup',
  'eyeTracking',
] as const;
const WATER_SETTING_KEYS = ['enabled', 'interval'] as const;
const UPDATE_SETTING_KEYS = ['automatic'] as const;
const AI_SETTING_KEYS = [
  'enabled',
  'provider',
  'model',
  'apiKeyConfigured',
  'endpoint',
  'baseUrl',
] as const;
const REQUIRED_AI_SETTING_KEYS = [
  'enabled',
  'provider',
  'model',
  'apiKeyConfigured',
  'endpoint',
] as const;
const AI_PATCH_KEYS = [
  'enabled',
  'provider',
  'model',
  'endpoint',
  'baseUrl',
] as const;
const AI_CONFIGURATION_KEYS = [...AI_PATCH_KEYS, 'apiKey'] as const;
const AI_MODEL_REFERENCE_KEYS = ['provider', 'modelId'] as const;
const AI_MODEL_EXPLORER_KEYS = ['favorites', 'recent'] as const;
const ROOT_SETTING_KEYS = [
  'userName',
  'stickyMessage',
  'reminders',
  'general',
  'water',
  'updates',
  'ai',
  'aiModelExplorer',
] as const;
const REQUIRED_ROOT_SETTING_KEYS = [
  'userName',
  'stickyMessage',
  'reminders',
  'general',
  'water',
  'ai',
] as const;
const MAXIMUM_MODEL_LENGTH = 256;
const MAXIMUM_API_KEY_LENGTH = 4_096;
const MAXIMUM_ENDPOINT_LENGTH = 2_048;
const MAXIMUM_RECENT_AI_MODELS =
  AI_PROVIDER_OPTIONS.length * MAXIMUM_RECENT_AI_MODELS_PER_PROVIDER;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean => Object.keys(value).every((key) => allowedKeys.includes(key));

const hasEveryKey = (
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
): boolean => requiredKeys.every((key) => Object.hasOwn(value, key));

export const isWaterReminderInterval = (
  value: unknown,
): value is WaterReminderInterval =>
  typeof value === 'number' &&
  WATER_REMINDER_INTERVAL_OPTIONS.some((interval) => interval === value);

const parseGeneralPatch = (
  value: unknown,
): GeneralSettingsPatch | null => {
  if (!isRecord(value) || !hasOnlyKeys(value, GENERAL_SETTING_KEYS)) {
    return null;
  }

  const { alwaysOnTop, launchAtStartup, eyeTracking } = value;

  if (
    (alwaysOnTop !== undefined && typeof alwaysOnTop !== 'boolean') ||
    (launchAtStartup !== undefined &&
      typeof launchAtStartup !== 'boolean') ||
    (eyeTracking !== undefined && typeof eyeTracking !== 'boolean')
  ) {
    return null;
  }

  return {
    ...(typeof alwaysOnTop === 'boolean' ? { alwaysOnTop } : {}),
    ...(typeof launchAtStartup === 'boolean'
      ? { launchAtStartup }
      : {}),
    ...(typeof eyeTracking === 'boolean' ? { eyeTracking } : {}),
  };
};

const parseWaterPatch = (value: unknown): WaterSettingsPatch | null => {
  if (!isRecord(value) || !hasOnlyKeys(value, WATER_SETTING_KEYS)) {
    return null;
  }

  const { enabled, interval } = value;

  if (
    (enabled !== undefined && typeof enabled !== 'boolean') ||
    (interval !== undefined && !isWaterReminderInterval(interval))
  ) {
    return null;
  }

  return {
    ...(typeof enabled === 'boolean' ? { enabled } : {}),
    ...(isWaterReminderInterval(interval) ? { interval } : {}),
  };
};

const parseUpdatePatch = (
  value: unknown,
): UpdateSettingsPatch | null => {
  if (!isRecord(value) || !hasOnlyKeys(value, UPDATE_SETTING_KEYS)) {
    return null;
  }

  const { automatic } = value;

  if (automatic !== undefined && typeof automatic !== 'boolean') {
    return null;
  }

  return {
    ...(typeof automatic === 'boolean' ? { automatic } : {}),
  };
};

const parseAiModelReference = (
  value: unknown,
): AiModelReference | null => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, AI_MODEL_REFERENCE_KEYS) ||
    !hasEveryKey(value, AI_MODEL_REFERENCE_KEYS) ||
    !isAiProvider(value.provider) ||
    typeof value.modelId !== 'string'
  ) {
    return null;
  }

  const modelId = value.modelId.trim();

  return modelId.length > 0 && modelId.length <= MAXIMUM_MODEL_LENGTH
    ? { provider: value.provider, modelId }
    : null;
};

const parseAiModelReferences = (
  value: unknown,
  maximumLength: number,
): readonly AiModelReference[] | null => {
  if (!Array.isArray(value) || value.length > maximumLength) {
    return null;
  }

  const references: AiModelReference[] = [];
  const seenReferences = new Set<string>();

  for (const candidate of value) {
    const reference = parseAiModelReference(candidate);

    if (reference === null) {
      return null;
    }

    const referenceKey = `${reference.provider}\u0000${reference.modelId}`;

    if (seenReferences.has(referenceKey)) {
      continue;
    }

    seenReferences.add(referenceKey);
    references.push(reference);
  }

  return references;
};

const parseAiModelExplorerPatch = (
  value: unknown,
): AiModelExplorerSettingsPatch | null => {
  if (!isRecord(value) || !hasOnlyKeys(value, AI_MODEL_EXPLORER_KEYS)) {
    return null;
  }

  const favorites =
    value.favorites === undefined
      ? undefined
      : parseAiModelReferences(
          value.favorites,
          MAXIMUM_FAVORITE_AI_MODELS,
        );
  const recent =
    value.recent === undefined
      ? undefined
      : parseAiModelReferences(value.recent, MAXIMUM_RECENT_AI_MODELS);

  if (favorites === null || recent === null) {
    return null;
  }

  return {
    ...(favorites === undefined ? {} : { favorites }),
    ...(recent === undefined ? {} : { recent }),
  };
};

const parseAiPatch = (value: unknown): AiSettingsPatch | null => {
  if (!isRecord(value) || !hasOnlyKeys(value, AI_PATCH_KEYS)) {
    return null;
  }

  const { enabled, provider, model, endpoint, baseUrl } = value;

  if (
    (enabled !== undefined && typeof enabled !== 'boolean') ||
    (provider !== undefined &&
      provider !== '' &&
      !isAiProvider(provider)) ||
    (model !== undefined &&
      (typeof model !== 'string' || model.length > MAXIMUM_MODEL_LENGTH)) ||
    (endpoint !== undefined &&
      (typeof endpoint !== 'string' ||
        endpoint.length > MAXIMUM_ENDPOINT_LENGTH ||
        !isValidAiEndpoint(endpoint))) ||
    (baseUrl !== undefined &&
      (typeof baseUrl !== 'string' ||
        baseUrl.length > MAXIMUM_ENDPOINT_LENGTH ||
        (baseUrl.length > 0 &&
          !isValidOpenAICompatibleBaseUrl(baseUrl))))
  ) {
    return null;
  }

  return {
    ...(typeof enabled === 'boolean' ? { enabled } : {}),
    ...(provider === '' || isAiProvider(provider) ? { provider } : {}),
    ...(typeof model === 'string' ? { model } : {}),
    ...(typeof endpoint === 'string' ? { endpoint } : {}),
    ...(typeof baseUrl === 'string' ? { baseUrl } : {}),
  };
};

export const parseSettingsPatch = (
  value: unknown,
): SettingsPatch | null => {
  if (!isRecord(value) || !hasOnlyKeys(value, ROOT_SETTING_KEYS)) {
    return null;
  }

  const general =
    value.general === undefined ? undefined : parseGeneralPatch(value.general);
  const water =
    value.water === undefined ? undefined : parseWaterPatch(value.water);
  const updates =
    value.updates === undefined
      ? undefined
      : parseUpdatePatch(value.updates);
  const ai = value.ai === undefined ? undefined : parseAiPatch(value.ai);
  const aiModelExplorer =
    value.aiModelExplorer === undefined
      ? undefined
      : parseAiModelExplorerPatch(value.aiModelExplorer);
  const userName =
    value.userName === undefined
      ? undefined
      : normalizeUserName(value.userName);
  const stickyMessage =
    value.stickyMessage === undefined
      ? undefined
      : value.stickyMessage === null
        ? null
        : normalizeStickyMessage(value.stickyMessage);
  const reminders =
    value.reminders === undefined
      ? undefined
      : parseStoredReminders(value.reminders);

  if (
    general === null ||
    water === null ||
    updates === null ||
    ai === null ||
    aiModelExplorer === null ||
    userName === null ||
    (value.stickyMessage !== undefined &&
      value.stickyMessage !== null &&
      stickyMessage === null) ||
    reminders === null
  ) {
    return null;
  }

  return {
    ...(userName === undefined ? {} : { userName }),
    ...(stickyMessage === undefined ? {} : { stickyMessage }),
    ...(reminders === undefined ? {} : { reminders }),
    ...(general === undefined ? {} : { general }),
    ...(water === undefined ? {} : { water }),
    ...(updates === undefined ? {} : { updates }),
    ...(ai === undefined ? {} : { ai }),
    ...(aiModelExplorer === undefined ? {} : { aiModelExplorer }),
  };
};

export const parsePreferencesSettingsPatch = (
  value: unknown,
): PreferencesSettingsPatch | null => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'general',
      'water',
      'updates',
      'aiModelExplorer',
    ])
  ) {
    return null;
  }

  const general =
    value.general === undefined ? undefined : parseGeneralPatch(value.general);
  const water =
    value.water === undefined ? undefined : parseWaterPatch(value.water);
  const updates =
    value.updates === undefined
      ? undefined
      : parseUpdatePatch(value.updates);
  const aiModelExplorer =
    value.aiModelExplorer === undefined
      ? undefined
      : parseAiModelExplorerPatch(value.aiModelExplorer);

  if (
    general === null ||
    water === null ||
    updates === null ||
    aiModelExplorer === null
  ) {
    return null;
  }

  return {
    ...(general === undefined ? {} : { general }),
    ...(water === undefined ? {} : { water }),
    ...(updates === undefined ? {} : { updates }),
    ...(aiModelExplorer === undefined ? {} : { aiModelExplorer }),
  };
};

export const parseAiConfigurationUpdate = (
  value: unknown,
): AiConfigurationUpdate | null => {
  if (!isRecord(value) || !hasOnlyKeys(value, AI_CONFIGURATION_KEYS)) {
    return null;
  }

  const { apiKey, ...aiPatchValue } = value;
  const aiPatch = parseAiPatch(aiPatchValue);

  if (
    aiPatch === null ||
    (apiKey !== undefined &&
      (typeof apiKey !== 'string' ||
        apiKey.length > MAXIMUM_API_KEY_LENGTH))
  ) {
    return null;
  }

  return {
    ...aiPatch,
    ...(typeof apiKey === 'string' ? { apiKey } : {}),
  };
};

export const mergeSettings = (
  settings: AppSettings,
  patch: SettingsPatch,
): AppSettings => ({
  userName: patch.userName ?? settings.userName,
  stickyMessage:
    patch.stickyMessage === undefined
      ? settings.stickyMessage
      : patch.stickyMessage,
  reminders: (patch.reminders ?? settings.reminders).map(cloneReminder),
  general: {
    ...settings.general,
    ...patch.general,
  },
  water: {
    ...settings.water,
    ...patch.water,
  },
  updates: {
    ...settings.updates,
    ...patch.updates,
  },
  ai: {
    ...settings.ai,
    ...patch.ai,
  },
  aiModelExplorer: {
    favorites: (
      patch.aiModelExplorer?.favorites ??
      settings.aiModelExplorer.favorites
    ).map((reference) => ({ ...reference })),
    recent: (
      patch.aiModelExplorer?.recent ?? settings.aiModelExplorer.recent
    ).map((reference) => ({ ...reference })),
  },
});

export const createDefaultSettings = (): AppSettings =>
  mergeSettings(DEFAULT_SETTINGS, {});

export const cloneSettings = (settings: AppSettings): AppSettings =>
  mergeSettings(settings, {});

export const toRuntimeSettings = (
  settings: Pick<
    AppSettings,
    'userName' | 'stickyMessage' | 'general' | 'water'
  >,
): RuntimeSettings => ({
  userName: settings.userName,
  stickyMessage: settings.stickyMessage,
  general: { ...settings.general },
  water: { ...settings.water },
});

export const toPreferencesSettings = (
  settings: AppSettings,
): PreferencesSettings => ({
  ...toRuntimeSettings(settings),
  updates: { ...settings.updates },
  ai: {
    enabled: settings.ai.enabled,
    provider: settings.ai.provider,
    model: settings.ai.model,
    apiKeyConfigured: settings.ai.apiKeyConfigured,
    endpoint: settings.ai.endpoint,
    baseUrl: settings.ai.baseUrl,
  },
  aiModelExplorer: {
    favorites: settings.aiModelExplorer.favorites.map((reference) => ({
      ...reference,
    })),
    recent: settings.aiModelExplorer.recent.map((reference) => ({
      ...reference,
    })),
  },
});

export const createDefaultRuntimeSettings = (): RuntimeSettings =>
  toRuntimeSettings(DEFAULT_SETTINGS);

export const createDefaultPreferencesSettings = (): PreferencesSettings =>
  toPreferencesSettings(DEFAULT_SETTINGS);

export const mergePreferencesSettings = (
  settings: PreferencesSettings,
  patch: PreferencesSettingsPatch,
): PreferencesSettings => ({
  userName: settings.userName,
  general: {
    ...settings.general,
    ...patch.general,
  },
  water: {
    ...settings.water,
    ...patch.water,
  },
  updates: {
    ...settings.updates,
    ...patch.updates,
  },
  ai: { ...settings.ai },
  aiModelExplorer: {
    favorites: (
      patch.aiModelExplorer?.favorites ??
      settings.aiModelExplorer.favorites
    ).map((reference) => ({ ...reference })),
    recent: (
      patch.aiModelExplorer?.recent ?? settings.aiModelExplorer.recent
    ).map((reference) => ({ ...reference })),
  },
});

export const parseSettings = (value: unknown): AppSettings | null => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ROOT_SETTING_KEYS) ||
    !hasEveryKey(value, REQUIRED_ROOT_SETTING_KEYS) ||
    normalizeUserName(value.userName) === null ||
    parseStoredReminders(value.reminders) === null ||
    !isRecord(value.general) ||
    !isRecord(value.water) ||
    !isRecord(value.ai) ||
    !hasOnlyKeys(value.general, GENERAL_SETTING_KEYS) ||
    !hasEveryKey(value.general, GENERAL_SETTING_KEYS) ||
    !hasOnlyKeys(value.water, WATER_SETTING_KEYS) ||
    !hasEveryKey(value.water, WATER_SETTING_KEYS) ||
    !hasOnlyKeys(value.ai, AI_SETTING_KEYS) ||
    !hasEveryKey(value.ai, REQUIRED_AI_SETTING_KEYS) ||
    typeof value.ai.apiKeyConfigured !== 'boolean'
  ) {
    return null;
  }

  const { apiKeyConfigured, ...aiPatchValue } = value.ai;
  const patch = parseSettingsPatch({
    userName: value.userName,
    stickyMessage: value.stickyMessage,
    reminders: value.reminders,
    general: value.general,
    water: value.water,
    ...(value.updates === undefined ? {} : { updates: value.updates }),
    ai: aiPatchValue,
    ...(value.aiModelExplorer === undefined
      ? {}
      : { aiModelExplorer: value.aiModelExplorer }),
  });

  if (patch === null) {
    return null;
  }

  const settings = mergeSettings(DEFAULT_SETTINGS, patch);

  return {
    ...settings,
    ai: {
      ...settings.ai,
      apiKeyConfigured,
    },
  };
};
