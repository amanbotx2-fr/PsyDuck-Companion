export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export type CursorPositionListener = (position: ScreenPoint) => void;

export interface DesktopBridge {
  readonly platform: string;
  readonly getCursorPosition: () => Promise<ScreenPoint>;
  readonly onCursorPosition: (listener: CursorPositionListener) => () => void;
}
