import type { AIModel, AIResponse } from '../ai/AIProvider';
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
  readonly showCompanionContextMenu: () => void;
  readonly getRuntimeSettings: () => Promise<RuntimeSettings>;
  readonly askAI: (prompt: string) => Promise<AIAskResult>;
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
