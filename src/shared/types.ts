import type { AppSettings, SettingsPatch } from './settings';

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export type CursorPositionListener = (position: ScreenPoint) => void;
export type SettingsChangeListener = (settings: AppSettings) => void;

export interface DesktopBridge {
  readonly platform: string;
  readonly getCursorPosition: () => Promise<ScreenPoint>;
  readonly onCursorPosition: (listener: CursorPositionListener) => () => void;
  readonly moveWindow: (position: ScreenPoint) => void;
  readonly showCompanionContextMenu: () => void;
  readonly getSettings: () => Promise<AppSettings>;
  readonly updateSettings: (patch: SettingsPatch) => Promise<AppSettings>;
  readonly onSettingsChanged: (
    listener: SettingsChangeListener,
  ) => () => void;
}
