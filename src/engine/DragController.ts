import type { ScreenPoint } from '../shared/types';

export interface DragControllerOptions {
  readonly surface: HTMLElement;
  readonly getWindowPosition: () => ScreenPoint;
  readonly moveWindow: (position: ScreenPoint) => void;
  readonly onDraggingChange?: (dragging: boolean) => void;
}

export class DragController {
  private readonly surface: HTMLElement;
  private readonly getWindowPosition: () => ScreenPoint;
  private readonly moveWindow: (position: ScreenPoint) => void;
  private readonly onDraggingChange: ((dragging: boolean) => void) | undefined;
  private dragOffset: ScreenPoint = { x: 0, y: 0 };
  private lastWindowPosition: ScreenPoint | null = null;
  private activePointerId: number | null = null;
  private attached = false;
  private dragging = false;

  public constructor(options: DragControllerOptions) {
    this.surface = options.surface;
    this.getWindowPosition = options.getWindowPosition;
    this.moveWindow = options.moveWindow;
    this.onDraggingChange = options.onDraggingChange;
  }

  public get isDragging(): boolean {
    return this.dragging;
  }

  public start(): void {
    if (this.attached) {
      return;
    }

    this.surface.addEventListener('pointerdown', this.handlePointerDown);
    this.surface.addEventListener('lostpointercapture', this.handleLostPointerCapture);
    this.attached = true;
  }

  public stop(): void {
    if (!this.attached) {
      return;
    }

    this.endDrag();
    this.surface.removeEventListener('pointerdown', this.handlePointerDown);
    this.surface.removeEventListener(
      'lostpointercapture',
      this.handleLostPointerCapture,
    );
    this.attached = false;
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.dragging || event.button !== 0 || !event.isPrimary) {
      return;
    }

    event.preventDefault();

    const windowPosition = this.getWindowPosition();
    this.dragOffset = {
      x: event.screenX - windowPosition.x,
      y: event.screenY - windowPosition.y,
    };
    this.lastWindowPosition = windowPosition;
    this.activePointerId = event.pointerId;
    this.dragging = true;

    this.surface.setPointerCapture(event.pointerId);
    this.addActiveListeners();
    this.onDraggingChange?.(true);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.isActivePointer(event)) {
      return;
    }

    if ((event.buttons & 1) === 0) {
      this.endDrag();
      return;
    }

    const nextWindowPosition = {
      x: event.screenX - this.dragOffset.x,
      y: event.screenY - this.dragOffset.y,
    };

    if (
      nextWindowPosition.x === this.lastWindowPosition?.x &&
      nextWindowPosition.y === this.lastWindowPosition.y
    ) {
      return;
    }

    this.lastWindowPosition = nextWindowPosition;
    this.moveWindow(nextWindowPosition);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.isActivePointer(event)) {
      this.endDrag();
    }
  };

  private readonly handleLostPointerCapture = (event: PointerEvent): void => {
    if (this.isActivePointer(event)) {
      this.endDrag();
    }
  };

  private readonly handleWindowBlur = (): void => {
    this.endDrag();
  };

  private isActivePointer(event: PointerEvent): boolean {
    return this.dragging && event.pointerId === this.activePointerId;
  }

  private addActiveListeners(): void {
    const ownerWindow = this.surface.ownerDocument.defaultView;

    ownerWindow?.addEventListener('pointermove', this.handlePointerMove);
    ownerWindow?.addEventListener('pointerup', this.handlePointerUp);
    ownerWindow?.addEventListener('pointercancel', this.handlePointerUp);
    ownerWindow?.addEventListener('blur', this.handleWindowBlur);
  }

  private removeActiveListeners(): void {
    const ownerWindow = this.surface.ownerDocument.defaultView;

    ownerWindow?.removeEventListener('pointermove', this.handlePointerMove);
    ownerWindow?.removeEventListener('pointerup', this.handlePointerUp);
    ownerWindow?.removeEventListener('pointercancel', this.handlePointerUp);
    ownerWindow?.removeEventListener('blur', this.handleWindowBlur);
  }

  private endDrag(): void {
    if (!this.dragging) {
      return;
    }

    const pointerId = this.activePointerId;
    this.dragging = false;
    this.activePointerId = null;
    this.lastWindowPosition = null;
    this.removeActiveListeners();

    if (pointerId !== null && this.surface.hasPointerCapture(pointerId)) {
      this.surface.releasePointerCapture(pointerId);
    }

    this.onDraggingChange?.(false);
  }
}
