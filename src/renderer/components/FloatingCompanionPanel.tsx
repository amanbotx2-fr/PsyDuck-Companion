import {
  useCallback,
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type TransitionEvent,
} from 'react';

export type FloatingCompanionPanelDismissReason =
  | 'cancel'
  | 'escape'
  | 'outside'
  | 'window-blur';

export interface FloatingCompanionPanelProps
  extends Omit<
    ComponentPropsWithoutRef<'form'>,
    'children' | 'className' | 'onKeyDown' | 'onTransitionEnd'
  > {
  readonly children: ReactNode;
  readonly className: string;
  readonly open: boolean;
  readonly onDismiss: (
    reason: FloatingCompanionPanelDismissReason,
  ) => void;
  readonly onAfterClose: () => void;
}

const CLOSE_TRANSITION_FALLBACK_MS = 220;

export function FloatingCompanionPanel({
  children,
  className,
  open,
  onDismiss,
  onAfterClose,
  ...formProps
}: FloatingCompanionPanelProps) {
  const panelRef = useRef<HTMLFormElement>(null);
  const wasOpenRef = useRef(false);
  const closeNotificationPendingRef = useRef(false);
  const closeFallbackTimerRef = useRef<ReturnType<
    typeof globalThis.setTimeout
  > | null>(null);

  const notifyAfterClose = useCallback((): void => {
    if (!closeNotificationPendingRef.current) {
      return;
    }

    closeNotificationPendingRef.current = false;

    if (closeFallbackTimerRef.current !== null) {
      globalThis.clearTimeout(closeFallbackTimerRef.current);
      closeFallbackTimerRef.current = null;
    }

    onAfterClose();
  }, [onAfterClose]);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      closeNotificationPendingRef.current = false;

      if (closeFallbackTimerRef.current !== null) {
        globalThis.clearTimeout(closeFallbackTimerRef.current);
        closeFallbackTimerRef.current = null;
      }

      return;
    }

    if (!wasOpenRef.current) {
      return;
    }

    wasOpenRef.current = false;
    closeNotificationPendingRef.current = true;
    closeFallbackTimerRef.current = globalThis.setTimeout(
      notifyAfterClose,
      CLOSE_TRANSITION_FALLBACK_MS,
    );

    return () => {
      if (closeFallbackTimerRef.current !== null) {
        globalThis.clearTimeout(closeFallbackTimerRef.current);
        closeFallbackTimerRef.current = null;
      }
    };
  }, [notifyAfterClose, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let duckPointerId: number | null = null;

    const handleOutsidePointerDown = (event: PointerEvent): void => {
      const target = event.target;

      if (
        target instanceof Node &&
        panelRef.current?.contains(target)
      ) {
        return;
      }

      // Let a drag finish before dismissing so the panel stays attached
      // throughout the pointer gesture.
      if (
        event.button === 0 &&
        target instanceof Element &&
        target.closest('.psyduck-stage') !== null
      ) {
        duckPointerId = event.pointerId;
        return;
      }

      onDismiss('outside');
    };

    const handlePointerUp = (event: PointerEvent): void => {
      if (event.pointerId !== duckPointerId) {
        return;
      }

      duckPointerId = null;
      onDismiss('outside');
    };

    const handlePointerCancel = (event: PointerEvent): void => {
      if (event.pointerId === duckPointerId) {
        duckPointerId = null;
      }
    };

    const handleWindowBlur = (): void => {
      onDismiss('window-blur');
    };

    document.addEventListener(
      'pointerdown',
      handleOutsidePointerDown,
      true,
    );
    document.addEventListener('pointerup', handlePointerUp, true);
    document.addEventListener(
      'pointercancel',
      handlePointerCancel,
      true,
    );
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener(
        'pointerdown',
        handleOutsidePointerDown,
        true,
      );
      document.removeEventListener('pointerup', handlePointerUp, true);
      document.removeEventListener(
        'pointercancel',
        handlePointerCancel,
        true,
      );
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [onDismiss, open]);

  const handleTransitionEnd = (
    event: TransitionEvent<HTMLFormElement>,
  ): void => {
    if (
      event.currentTarget !== event.target ||
      event.propertyName !== 'opacity' ||
      open
    ) {
      return;
    }

    notifyAfterClose();
  };

  return (
    <form
      {...formProps}
      ref={panelRef}
      className={`floating-companion-panel ${className}`}
      data-open={open}
      aria-hidden={!open}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') {
          return;
        }

        event.preventDefault();
        onDismiss('escape');
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      {children}
    </form>
  );
}
