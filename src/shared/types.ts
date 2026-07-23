import type { AIModel, AIResponse } from '../ai/AIProvider';
import type {
  PomodoroCompletionListener,
  PomodoroCustomDurationRequestListener,
  PomodoroState,
  PomodoroStateListener,
} from './pomodoro';
import type {
  CreateReminderInput,
  Reminder,
  ReminderFiredNotification,
  UpdateReminderInput,
} from './reminders';
import type {
  AiConfigurationUpdate,
  PreferencesSettings,
  PreferencesSettingsPatch,
  RuntimeSettings,
} from './settings';

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export type CursorPositionListener = (position: ScreenPoint) => void;
export type RuntimeSettingsChangeListener = (
  settings: RuntimeSettings,
) => void;
export type UserNamePanelRequestListener = () => void;
export type StickyMessagePanelRequestListener = () => void;
export type ReminderCreationPanelRequestListener = () => void;
export type ReminderManagerPanelRequestListener = () => void;
export type ReminderFiredListener = (
  notification: ReminderFiredNotification,
) => void;

export type AIAskResult =
  | {
      readonly ok: true;
      readonly response: AIResponse;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

export type AIModelListResult =
  | {
      readonly ok: true;
      readonly models: readonly AIModel[];
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

export type AIConnectionTestResult =
  | {
      readonly ok: true;
      readonly message: string;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

export interface CompanionBridge {
  readonly platform: string;
  readonly getCursorPosition: () => Promise<ScreenPoint>;
  readonly onCursorPosition: (listener: CursorPositionListener) => () => void;
  readonly moveWindow: (position: ScreenPoint) => void;
  readonly setCompanionContentHeight: (height: number) => void;
  readonly showCompanionContextMenu: () => void;
  readonly getRuntimeSettings: () => Promise<RuntimeSettings>;
  readonly updateUserName: (name: string) => Promise<string>;
  readonly updateStickyMessage: (
    message: string | null,
  ) => Promise<string | null>;
  readonly onUserNamePanelRequested: (
    listener: UserNamePanelRequestListener,
  ) => () => void;
  readonly onStickyMessagePanelRequested: (
    listener: StickyMessagePanelRequestListener,
  ) => () => void;
  readonly onReminderCreationPanelRequested: (
    listener: ReminderCreationPanelRequestListener,
  ) => () => void;
  readonly onReminderManagerPanelRequested: (
    listener: ReminderManagerPanelRequestListener,
  ) => () => void;
  readonly onReminderFired: (
    listener: ReminderFiredListener,
  ) => () => void;
  readonly askAI: (prompt: string) => Promise<AIAskResult>;
  readonly startPomodoro: (durationMinutes: number) => Promise<void>;
  readonly notifyCustomPomodoroPanelClosed: () => void;
  readonly onCustomPomodoroDurationRequested: (
    listener: PomodoroCustomDurationRequestListener,
  ) => () => void;
  readonly getPomodoroState: () => PomodoroState | null;
  readonly onPomodoroStateChanged: (
    listener: PomodoroStateListener,
  ) => () => void;
  readonly onPomodoroCompleted: (
    listener: PomodoroCompletionListener,
  ) => () => void;
  readonly createReminder: (
    input: CreateReminderInput,
  ) => Promise<Reminder>;
  readonly updateReminder: (
    id: string,
    input: UpdateReminderInput,
  ) => Promise<Reminder>;
  readonly deleteReminder: (id: string) => Promise<boolean>;
  readonly getReminder: (id: string) => Promise<Reminder | null>;
  readonly listReminders: () => Promise<readonly Reminder[]>;
  readonly markReminderCompleted: (id: string) => Promise<Reminder>;
  readonly onRuntimeSettingsChanged: (
    listener: RuntimeSettingsChangeListener,
  ) => () => void;
}

export interface PreferencesBridge {
  readonly getPreferencesSettings: () => Promise<PreferencesSettings>;
  readonly updatePreferencesSettings: (
    patch: PreferencesSettingsPatch,
  ) => Promise<PreferencesSettings>;
  readonly updateAiConfiguration: (
    configuration: AiConfigurationUpdate,
  ) => Promise<PreferencesSettings>;
  readonly listAIModels: () => Promise<AIModelListResult>;
  readonly testAIConnection: () => Promise<AIConnectionTestResult>;
  readonly onRuntimeSettingsChanged: (
    listener: RuntimeSettingsChangeListener,
  ) => () => void;
}
