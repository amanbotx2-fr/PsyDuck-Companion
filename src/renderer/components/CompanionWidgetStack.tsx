import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export const COMPANION_WIDGET_IDS = {
  dailyPlannerPanel: 'daily-planner-panel',
  reminderManagerPanel: 'reminder-manager-panel',
  reminderPanel: 'reminder-panel',
  userNamePanel: 'user-name-panel',
  pomodoroPanel: 'pomodoro-panel',
  stickyMessagePanel: 'sticky-message-panel',
  reminder: 'reminder',
  ai: 'ai',
  stickyMessage: 'sticky-message',
  speechBubble: 'speech-bubble',
  pomodoro: 'pomodoro',
} as const;

export type CompanionWidgetId =
  (typeof COMPANION_WIDGET_IDS)[keyof typeof COMPANION_WIDGET_IDS];

const WIDGET_ORDER: Readonly<Record<CompanionWidgetId, number>> = {
  [COMPANION_WIDGET_IDS.dailyPlannerPanel]: 70,
  [COMPANION_WIDGET_IDS.reminderManagerPanel]: 80,
  [COMPANION_WIDGET_IDS.reminderPanel]: 90,
  [COMPANION_WIDGET_IDS.userNamePanel]: 100,
  [COMPANION_WIDGET_IDS.pomodoroPanel]: 110,
  [COMPANION_WIDGET_IDS.stickyMessagePanel]: 120,
  [COMPANION_WIDGET_IDS.reminder]: 150,
  [COMPANION_WIDGET_IDS.ai]: 200,
  [COMPANION_WIDGET_IDS.stickyMessage]: 300,
  [COMPANION_WIDGET_IDS.speechBubble]: 350,
  [COMPANION_WIDGET_IDS.pomodoro]: 400,
};

interface WidgetStackContextValue {
  readonly register: (id: CompanionWidgetId) => () => void;
}

const WidgetStackContext = createContext<WidgetStackContextValue | null>(
  null,
);

export interface CompanionWidgetProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly id: CompanionWidgetId;
}

export function CompanionWidget({
  children,
  className,
  id,
}: CompanionWidgetProps) {
  const stack = useContext(WidgetStackContext);

  useLayoutEffect(() => {
    if (stack === null) {
      return;
    }

    return stack.register(id);
  }, [id, stack]);

  if (stack === null) {
    throw new Error(
      'CompanionWidget must be rendered inside CompanionWidgetStack.',
    );
  }

  return (
    <div
      className={[
        'companion-widget',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-widget-id={id}
      style={{ order: WIDGET_ORDER[id] }}
    >
      {children}
    </div>
  );
}

export interface CompanionWidgetStackProps {
  readonly anchor: ReactNode;
  readonly children: ReactNode;
  readonly onContentHeightChange: (height: number) => void;
}

export function CompanionWidgetStack({
  anchor,
  children,
  onContentHeightChange,
}: CompanionWidgetStackProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const registeredWidgetsRef = useRef(new Set<CompanionWidgetId>());
  const [registeredWidgetCount, setRegisteredWidgetCount] = useState(0);
  const previousHeightRef = useRef<number | null>(null);

  const register = useCallback((id: CompanionWidgetId): (() => void) => {
    registeredWidgetsRef.current.add(id);
    setRegisteredWidgetCount(registeredWidgetsRef.current.size);

    return () => {
      registeredWidgetsRef.current.delete(id);
      setRegisteredWidgetCount(registeredWidgetsRef.current.size);
    };
  }, []);

  const contextValue = useMemo<WidgetStackContextValue>(
    () => ({ register }),
    [register],
  );

  useLayoutEffect(() => {
    const scene = sceneRef.current;

    if (scene === null) {
      return;
    }

    let animationFrameId: number | null = null;
    const reportHeight = (): void => {
      animationFrameId = null;
      const nextHeight = Math.ceil(scene.getBoundingClientRect().height);

      if (
        nextHeight <= 0 ||
        previousHeightRef.current === nextHeight
      ) {
        return;
      }

      previousHeightRef.current = nextHeight;
      onContentHeightChange(nextHeight);
    };
    const scheduleHeightReport = (): void => {
      if (animationFrameId === null) {
        animationFrameId = requestAnimationFrame(reportHeight);
      }
    };
    const resizeObserver = new ResizeObserver(scheduleHeightReport);
    resizeObserver.observe(scene);
    reportHeight();

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }

      resizeObserver.disconnect();
    };
  }, [onContentHeightChange]);

  return (
    <WidgetStackContext.Provider value={contextValue}>
      <div
        ref={sceneRef}
        className="companion-widget-scene"
        data-widget-count={registeredWidgetCount}
      >
        <div className="companion-widget-stack">{children}</div>
        {anchor}
      </div>
    </WidgetStackContext.Provider>
  );
}
