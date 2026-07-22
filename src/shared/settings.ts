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
] as const;

export type AiProvider = (typeof AI_PROVIDER_OPTIONS)[number]['id'];
export type AiProviderSelection = AiProvider | '';

export const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';

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

export interface GeneralSettings {
  readonly alwaysOnTop: boolean;
  readonly launchAtStartup: boolean;
  readonly eyeTracking: boolean;
}

export interface WaterSettings {
  readonly enabled: boolean;
  readonly interval: WaterReminderInterval;
}

export interface AiSettings {
  readonly enabled: boolean;
  readonly provider: AiProviderSelection;
  readonly model: string;
  readonly apiKey: string;
  readonly endpoint: string;
}

export interface AppSettings {
  readonly general: GeneralSettings;
  readonly water: WaterSettings;
  readonly ai: AiSettings;
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

export interface AiSettingsPatch {
  readonly enabled?: boolean;
  readonly provider?: AiProviderSelection;
  readonly model?: string;
  readonly apiKey?: string;
  readonly endpoint?: string;
}

export interface SettingsPatch {
  readonly general?: GeneralSettingsPatch;
  readonly water?: WaterSettingsPatch;
  readonly ai?: AiSettingsPatch;
}

const DEFAULT_SETTINGS: AppSettings = {
  general: {
    alwaysOnTop: true,
    launchAtStartup: false,
    eyeTracking: true,
  },
  water: {
    enabled: true,
    interval: 30,
  },
  ai: {
    enabled: false,
    provider: '',
    model: '',
    apiKey: '',
    endpoint: DEFAULT_OLLAMA_ENDPOINT,
  },
};

const GENERAL_SETTING_KEYS = [
  'alwaysOnTop',
  'launchAtStartup',
  'eyeTracking',
] as const;
const WATER_SETTING_KEYS = ['enabled', 'interval'] as const;
const AI_SETTING_KEYS = [
  'enabled',
  'provider',
  'model',
  'apiKey',
  'endpoint',
] as const;
const LEGACY_AI_SETTING_KEYS = ['enabled', 'provider', 'apiKey'] as const;
const ROOT_SETTING_KEYS = ['general', 'water', 'ai'] as const;
const MAXIMUM_MODEL_LENGTH = 256;
const MAXIMUM_API_KEY_LENGTH = 4_096;
const MAXIMUM_ENDPOINT_LENGTH = 2_048;

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

const parseAiPatch = (value: unknown): AiSettingsPatch | null => {
  if (!isRecord(value) || !hasOnlyKeys(value, AI_SETTING_KEYS)) {
    return null;
  }

  const { enabled, provider, model, apiKey, endpoint } = value;

  if (
    (enabled !== undefined && typeof enabled !== 'boolean') ||
    (provider !== undefined &&
      provider !== '' &&
      !isAiProvider(provider)) ||
    (model !== undefined &&
      (typeof model !== 'string' || model.length > MAXIMUM_MODEL_LENGTH)) ||
    (apiKey !== undefined &&
      (typeof apiKey !== 'string' ||
        apiKey.length > MAXIMUM_API_KEY_LENGTH)) ||
    (endpoint !== undefined &&
      (typeof endpoint !== 'string' ||
        endpoint.length > MAXIMUM_ENDPOINT_LENGTH ||
        !isValidAiEndpoint(endpoint)))
  ) {
    return null;
  }

  return {
    ...(typeof enabled === 'boolean' ? { enabled } : {}),
    ...(provider === '' || isAiProvider(provider) ? { provider } : {}),
    ...(typeof model === 'string' ? { model } : {}),
    ...(typeof apiKey === 'string' ? { apiKey } : {}),
    ...(typeof endpoint === 'string' ? { endpoint } : {}),
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
  const ai = value.ai === undefined ? undefined : parseAiPatch(value.ai);

  if (general === null || water === null || ai === null) {
    return null;
  }

  return {
    ...(general === undefined ? {} : { general }),
    ...(water === undefined ? {} : { water }),
    ...(ai === undefined ? {} : { ai }),
  };
};

export const mergeSettings = (
  settings: AppSettings,
  patch: SettingsPatch,
): AppSettings => ({
  general: {
    ...settings.general,
    ...patch.general,
  },
  water: {
    ...settings.water,
    ...patch.water,
  },
  ai: {
    ...settings.ai,
    ...patch.ai,
  },
});

export const createDefaultSettings = (): AppSettings =>
  mergeSettings(DEFAULT_SETTINGS, {});

export const cloneSettings = (settings: AppSettings): AppSettings =>
  mergeSettings(settings, {});

export const parseSettings = (value: unknown): AppSettings | null => {
  if (!isRecord(value)) {
    return null;
  }

  const patch = parseSettingsPatch(value);

  if (
    patch === null ||
    !isRecord(value.general) ||
    !isRecord(value.water) ||
    !isRecord(value.ai) ||
    Object.keys(value.general).length !== GENERAL_SETTING_KEYS.length ||
    Object.keys(value.water).length !== WATER_SETTING_KEYS.length ||
    !hasOnlyKeys(value.ai, AI_SETTING_KEYS) ||
    !hasEveryKey(value.ai, LEGACY_AI_SETTING_KEYS)
  ) {
    return null;
  }

  const settings = mergeSettings(DEFAULT_SETTINGS, patch);

  return settings;
};
