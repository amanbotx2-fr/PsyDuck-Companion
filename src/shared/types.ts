import type { AIModel, AIResponse } from '../ai/AIProvider';
import type { AppSettings, SettingsPatch } from './settings';

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export type CursorPositionListener = (position: ScreenPoint) => void;
export type SettingsChangeListener = (settings: AppSettings) => void;

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
      readonly models: readonly AIModel[];
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

export interface DesktopBridge {
  readonly platform: string;
  readonly getCursorPosition: () => Promise<ScreenPoint>;
  readonly onCursorPosition: (listener: CursorPositionListener) => () => void;
  readonly moveWindow: (position: ScreenPoint) => void;
  readonly showCompanionContextMenu: () => void;
  readonly getSettings: () => Promise<AppSettings>;
  readonly updateSettings: (patch: SettingsPatch) => Promise<AppSettings>;
  readonly askAI: (prompt: string) => Promise<AIAskResult>;
  readonly listAIModels: () => Promise<AIModelListResult>;
  readonly testAIConnection: () => Promise<AIConnectionTestResult>;
  readonly onSettingsChanged: (
    listener: SettingsChangeListener,
  ) => () => void;
}
