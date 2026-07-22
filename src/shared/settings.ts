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
  readonly provider: string;
  readonly apiKey: string;
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
  readonly provider?: string;
  readonly apiKey?: string;
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
    apiKey: '',
  },
};

const GENERAL_SETTING_KEYS = [
  'alwaysOnTop',
  'launchAtStartup',
  'eyeTracking',
] as const;
const WATER_SETTING_KEYS = ['enabled', 'interval'] as const;
const AI_SETTING_KEYS = ['enabled', 'provider', 'apiKey'] as const;
const ROOT_SETTING_KEYS = ['general', 'water', 'ai'] as const;
const MAXIMUM_PROVIDER_LENGTH = 128;
const MAXIMUM_API_KEY_LENGTH = 4_096;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean => Object.keys(value).every((key) => allowedKeys.includes(key));

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

  const { enabled, provider, apiKey } = value;

  if (
    (enabled !== undefined && typeof enabled !== 'boolean') ||
    (provider !== undefined &&
      (typeof provider !== 'string' ||
        provider.length > MAXIMUM_PROVIDER_LENGTH)) ||
    (apiKey !== undefined &&
      (typeof apiKey !== 'string' || apiKey.length > MAXIMUM_API_KEY_LENGTH))
  ) {
    return null;
  }

  return {
    ...(typeof enabled === 'boolean' ? { enabled } : {}),
    ...(typeof provider === 'string' ? { provider } : {}),
    ...(typeof apiKey === 'string' ? { apiKey } : {}),
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
    Object.keys(value.ai).length !== AI_SETTING_KEYS.length
  ) {
    return null;
  }

  const settings = mergeSettings(DEFAULT_SETTINGS, patch);

  return settings;
};
