export const NOTIFICATION_SOUND_EVENT_TYPES = [
  'pomodoro',
  'reminder',
] as const;

export type NotificationSoundEventType =
  (typeof NOTIFICATION_SOUND_EVENT_TYPES)[number];

export const NOTIFICATION_SOUND_OPTIONS = [
  {
    id: 'soft-bell',
    label: 'Soft Bell',
  },
  {
    id: 'digital-bell',
    label: 'Digital Bell',
  },
  {
    id: 'zen-chime',
    label: 'Zen Chime',
  },
  {
    id: 'pop',
    label: 'Pop',
  },
] as const;

export type NotificationSoundId =
  (typeof NOTIFICATION_SOUND_OPTIONS)[number]['id'];

export interface NotificationSoundSettings {
  readonly enabled: boolean;
  readonly sound: NotificationSoundId;
  readonly volume: number;
}

export interface NotificationSoundSettingsPatch {
  readonly enabled?: boolean;
  readonly sound?: NotificationSoundId;
  readonly volume?: number;
}

export const DEFAULT_NOTIFICATION_SOUND_SETTINGS: NotificationSoundSettings = {
  enabled: true,
  sound: 'soft-bell',
  volume: 70,
};

const NOTIFICATION_SOUND_SETTING_KEYS = [
  'enabled',
  'sound',
  'volume',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean => Object.keys(value).every((key) => allowedKeys.includes(key));

export const isNotificationSoundId = (
  value: unknown,
): value is NotificationSoundId =>
  typeof value === 'string' &&
  NOTIFICATION_SOUND_OPTIONS.some((sound) => sound.id === value);

export const isNotificationSoundVolume = (
  value: unknown,
): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 100;

export const parseNotificationSoundSettingsPatch = (
  value: unknown,
): NotificationSoundSettingsPatch | null => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, NOTIFICATION_SOUND_SETTING_KEYS)
  ) {
    return null;
  }

  const { enabled, sound, volume } = value;

  if (
    (enabled !== undefined && typeof enabled !== 'boolean') ||
    (sound !== undefined && !isNotificationSoundId(sound)) ||
    (volume !== undefined && !isNotificationSoundVolume(volume))
  ) {
    return null;
  }

  return {
    ...(typeof enabled === 'boolean' ? { enabled } : {}),
    ...(isNotificationSoundId(sound) ? { sound } : {}),
    ...(isNotificationSoundVolume(volume) ? { volume } : {}),
  };
};

export const mergeNotificationSoundSettings = (
  settings: NotificationSoundSettings,
  patch: NotificationSoundSettingsPatch,
): NotificationSoundSettings => ({
  ...settings,
  ...patch,
});
