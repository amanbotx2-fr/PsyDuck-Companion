import { contextBridge, ipcRenderer } from 'electron';

import type { DailyPlannerBriefing } from '../shared/dailyPlanner';
import type { RuntimeSettings } from '../shared/settings';
import type {
  PomodoroCompletionListener,
  PomodoroCustomDurationRequestListener,
  PomodoroState,
  PomodoroStateListener,
} from '../shared/pomodoro';
import type {
  CreateReminderInput,
  Reminder,
  ReminderFiredNotification,
  UpdateReminderInput,
} from '../shared/reminders';
import type {
  AIAskResult,
  CompanionBridge,
  CursorPositionListener,
  DailyPlannerPanelRequestListener,
  ReminderCreationPanelRequestListener,
  ReminderFiredListener,
  ReminderManagerPanelRequestListener,
  RuntimeSettingsChangeListener,
  ScreenPoint,
  StickyMessagePanelRequestListener,
  UserNamePanelRequestListener,
} from '../shared/types';

// Sandboxed preload scripts cannot require local CommonJS modules. Keep the
// runtime channel table self-contained; type-only imports above are erased.
const IPC_CHANNELS = {
  cursorPosition: 'psyduck:cursor-position',
  getCursorPosition: 'psyduck:get-cursor-position',
  moveWindow: 'psyduck:move-window',
  setCompanionContentHeight: 'psyduck:set-content-height',
  showCompanionContextMenu: 'psyduck:show-context-menu',
  getRuntimeSettings: 'runtime-settings:get',
  updateUserName: 'runtime-settings:update-user-name',
  updateStickyMessage: 'runtime-settings:update-sticky-message',
  runtimeSettingsChanged: 'runtime-settings:changed',
  userNamePanelRequested: 'personal-assistant:user-name-requested',
  stickyMessagePanelRequested:
    'personal-assistant:sticky-message-requested',
  reminderCreationPanelRequested:
    'reminders:creation-panel-requested',
  reminderManagerPanelRequested:
    'reminders:manager-panel-requested',
  dailyPlannerPanelRequested:
    'daily-planner:panel-requested',
  reminderFired: 'reminders:fired',
  askAI: 'ai:ask',
  startPomodoro: 'pomodoro:start',
  customPomodoroPanelClosed: 'pomodoro:custom-panel-closed',
  customPomodoroDurationRequested:
    'pomodoro:custom-duration-requested',
  pomodoroStateChanged: 'pomodoro:state-changed',
  pomodoroCompleted: 'pomodoro:completed',
  createReminder: 'reminders:create',
  updateReminder: 'reminders:update',
  deleteReminder: 'reminders:delete',
  getReminder: 'reminders:get',
  listReminders: 'reminders:list',
  markReminderCompleted: 'reminders:mark-completed',
  getDailyPlanner: 'daily-planner:get',
} as const;

const pomodoroStateListeners = new Set<PomodoroStateListener>();
const pomodoroCompletionListeners =
  new Set<PomodoroCompletionListener>();
const customPomodoroDurationRequestListeners =
  new Set<PomodoroCustomDurationRequestListener>();
const userNamePanelRequestListeners =
  new Set<UserNamePanelRequestListener>();
const stickyMessagePanelRequestListeners =
  new Set<StickyMessagePanelRequestListener>();
const reminderCreationPanelRequestListeners =
  new Set<ReminderCreationPanelRequestListener>();
const reminderManagerPanelRequestListeners =
  new Set<ReminderManagerPanelRequestListener>();
const dailyPlannerPanelRequestListeners =
  new Set<DailyPlannerPanelRequestListener>();
const reminderFiredListeners = new Set<ReminderFiredListener>();
const pendingReminderNotifications: ReminderFiredNotification[] = [];
let latestPomodoroState: PomodoroState | null = null;
let pendingPomodoroCompletion = false;
let pendingCustomPomodoroDurationRequest = false;
let pendingUserNamePanelRequest = false;
let pendingStickyMessagePanelRequest = false;
let pendingReminderCreationPanelRequest = false;
let pendingReminderManagerPanelRequest = false;
let pendingDailyPlannerPanelRequest = false;

ipcRenderer.on(IPC_CHANNELS.userNamePanelRequested, () => {
  if (userNamePanelRequestListeners.size === 0) {
    pendingUserNamePanelRequest = true;
    return;
  }

  for (const listener of userNamePanelRequestListeners) {
    listener();
  }
});

ipcRenderer.on(IPC_CHANNELS.stickyMessagePanelRequested, () => {
  if (stickyMessagePanelRequestListeners.size === 0) {
    pendingStickyMessagePanelRequest = true;
    return;
  }

  for (const listener of stickyMessagePanelRequestListeners) {
    listener();
  }
});

ipcRenderer.on(IPC_CHANNELS.reminderCreationPanelRequested, () => {
  if (reminderCreationPanelRequestListeners.size === 0) {
    pendingReminderCreationPanelRequest = true;
    return;
  }

  for (const listener of reminderCreationPanelRequestListeners) {
    listener();
  }
});

ipcRenderer.on(IPC_CHANNELS.reminderManagerPanelRequested, () => {
  if (reminderManagerPanelRequestListeners.size === 0) {
    pendingReminderManagerPanelRequest = true;
    return;
  }

  for (const listener of reminderManagerPanelRequestListeners) {
    listener();
  }
});

ipcRenderer.on(IPC_CHANNELS.dailyPlannerPanelRequested, () => {
  if (dailyPlannerPanelRequestListeners.size === 0) {
    pendingDailyPlannerPanelRequest = true;
    return;
  }

  for (const listener of dailyPlannerPanelRequestListeners) {
    listener();
  }
});

ipcRenderer.on(
  IPC_CHANNELS.reminderFired,
  (_event, notification: ReminderFiredNotification) => {
    const nextNotification = Object.freeze({
      ...notification,
      reminder: Object.freeze({ ...notification.reminder }),
    });

    if (reminderFiredListeners.size === 0) {
      pendingReminderNotifications.push(nextNotification);
      return;
    }

    for (const listener of reminderFiredListeners) {
      listener(nextNotification);
    }
  },
);

ipcRenderer.on(
  IPC_CHANNELS.pomodoroStateChanged,
  (_event, state: PomodoroState) => {
    latestPomodoroState = Object.freeze({ ...state });

    for (const listener of pomodoroStateListeners) {
      listener(latestPomodoroState);
    }
  },
);

ipcRenderer.on(IPC_CHANNELS.pomodoroCompleted, () => {
  if (pomodoroCompletionListeners.size === 0) {
    pendingPomodoroCompletion = true;
    return;
  }

  for (const listener of pomodoroCompletionListeners) {
    listener();
  }
});

ipcRenderer.on(
  IPC_CHANNELS.customPomodoroDurationRequested,
  () => {
    if (customPomodoroDurationRequestListeners.size === 0) {
      pendingCustomPomodoroDurationRequest = true;
      return;
    }

    for (const listener of customPomodoroDurationRequestListeners) {
      listener();
    }
  },
);

const companionBridge: CompanionBridge = Object.freeze({
  platform: process.platform,
  getCursorPosition: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getCursorPosition) as Promise<ScreenPoint>,
  onCursorPosition: (listener: CursorPositionListener) => {
    const handleCursorPosition = (
      _event: Electron.IpcRendererEvent,
      position: ScreenPoint,
    ) => {
      listener(position);
    };

    ipcRenderer.on(IPC_CHANNELS.cursorPosition, handleCursorPosition);

    return () => {
      ipcRenderer.removeListener(
        IPC_CHANNELS.cursorPosition,
        handleCursorPosition,
      );
    };
  },
  moveWindow: (position: ScreenPoint) => {
    ipcRenderer.send(IPC_CHANNELS.moveWindow, position);
  },
  setCompanionContentHeight: (height: number) => {
    ipcRenderer.send(IPC_CHANNELS.setCompanionContentHeight, height);
  },
  showCompanionContextMenu: () => {
    ipcRenderer.send(IPC_CHANNELS.showCompanionContextMenu);
  },
  getRuntimeSettings: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.getRuntimeSettings,
    ) as Promise<RuntimeSettings>,
  updateUserName: (name: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateUserName, name) as Promise<string>,
  updateStickyMessage: (message: string | null) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.updateStickyMessage,
      message,
    ) as Promise<string | null>,
  onUserNamePanelRequested: (
    listener: UserNamePanelRequestListener,
  ) => {
    userNamePanelRequestListeners.add(listener);

    if (pendingUserNamePanelRequest) {
      queueMicrotask(() => {
        if (userNamePanelRequestListeners.has(listener)) {
          pendingUserNamePanelRequest = false;
          listener();
        }
      });
    }

    return () => {
      userNamePanelRequestListeners.delete(listener);
    };
  },
  onStickyMessagePanelRequested: (
    listener: StickyMessagePanelRequestListener,
  ) => {
    stickyMessagePanelRequestListeners.add(listener);

    if (pendingStickyMessagePanelRequest) {
      queueMicrotask(() => {
        if (stickyMessagePanelRequestListeners.has(listener)) {
          pendingStickyMessagePanelRequest = false;
          listener();
        }
      });
    }

    return () => {
      stickyMessagePanelRequestListeners.delete(listener);
    };
  },
  onReminderCreationPanelRequested: (
    listener: ReminderCreationPanelRequestListener,
  ) => {
    reminderCreationPanelRequestListeners.add(listener);

    if (pendingReminderCreationPanelRequest) {
      queueMicrotask(() => {
        if (reminderCreationPanelRequestListeners.has(listener)) {
          pendingReminderCreationPanelRequest = false;
          listener();
        }
      });
    }

    return () => {
      reminderCreationPanelRequestListeners.delete(listener);
    };
  },
  onReminderManagerPanelRequested: (
    listener: ReminderManagerPanelRequestListener,
  ) => {
    reminderManagerPanelRequestListeners.add(listener);

    if (pendingReminderManagerPanelRequest) {
      queueMicrotask(() => {
        if (reminderManagerPanelRequestListeners.has(listener)) {
          pendingReminderManagerPanelRequest = false;
          listener();
        }
      });
    }

    return () => {
      reminderManagerPanelRequestListeners.delete(listener);
    };
  },
  onDailyPlannerPanelRequested: (
    listener: DailyPlannerPanelRequestListener,
  ) => {
    dailyPlannerPanelRequestListeners.add(listener);

    if (pendingDailyPlannerPanelRequest) {
      queueMicrotask(() => {
        if (dailyPlannerPanelRequestListeners.has(listener)) {
          pendingDailyPlannerPanelRequest = false;
          listener();
        }
      });
    }

    return () => {
      dailyPlannerPanelRequestListeners.delete(listener);
    };
  },
  onReminderFired: (listener: ReminderFiredListener) => {
    reminderFiredListeners.add(listener);

    if (pendingReminderNotifications.length > 0) {
      queueMicrotask(() => {
        if (!reminderFiredListeners.has(listener)) {
          return;
        }

        const pendingNotifications =
          pendingReminderNotifications.splice(0);

        for (const notification of pendingNotifications) {
          listener(notification);
        }
      });
    }

    return () => {
      reminderFiredListeners.delete(listener);
    };
  },
  askAI: (prompt: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.askAI, prompt) as Promise<AIAskResult>,
  startPomodoro: (durationMinutes: number) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.startPomodoro,
      durationMinutes,
    ) as Promise<void>,
  notifyCustomPomodoroPanelClosed: () => {
    ipcRenderer.send(IPC_CHANNELS.customPomodoroPanelClosed);
  },
  onCustomPomodoroDurationRequested: (
    listener: PomodoroCustomDurationRequestListener,
  ) => {
    customPomodoroDurationRequestListeners.add(listener);

    if (pendingCustomPomodoroDurationRequest) {
      queueMicrotask(() => {
        if (customPomodoroDurationRequestListeners.has(listener)) {
          pendingCustomPomodoroDurationRequest = false;
          listener();
        }
      });
    }

    return () => {
      customPomodoroDurationRequestListeners.delete(listener);
    };
  },
  getPomodoroState: () => latestPomodoroState,
  onPomodoroStateChanged: (listener: PomodoroStateListener) => {
    pomodoroStateListeners.add(listener);

    return () => {
      pomodoroStateListeners.delete(listener);
    };
  },
  onPomodoroCompleted: (listener: PomodoroCompletionListener) => {
    pomodoroCompletionListeners.add(listener);

    if (pendingPomodoroCompletion) {
      queueMicrotask(() => {
        if (pomodoroCompletionListeners.has(listener)) {
          pendingPomodoroCompletion = false;
          listener();
        }
      });
    }

    return () => {
      pomodoroCompletionListeners.delete(listener);
    };
  },
  createReminder: (input: CreateReminderInput) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.createReminder,
      input,
    ) as Promise<Reminder>,
  updateReminder: (id: string, input: UpdateReminderInput) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.updateReminder,
      id,
      input,
    ) as Promise<Reminder>,
  deleteReminder: (id: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.deleteReminder,
      id,
    ) as Promise<boolean>,
  getReminder: (id: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.getReminder,
      id,
    ) as Promise<Reminder | null>,
  listReminders: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.listReminders,
    ) as Promise<readonly Reminder[]>,
  markReminderCompleted: (id: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.markReminderCompleted,
      id,
    ) as Promise<Reminder>,
  getDailyPlanner: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.getDailyPlanner,
    ) as Promise<DailyPlannerBriefing>,
  onRuntimeSettingsChanged: (listener: RuntimeSettingsChangeListener) => {
    const handleRuntimeSettingsChanged = (
      _event: Electron.IpcRendererEvent,
      settings: RuntimeSettings,
    ): void => {
      listener(settings);
    };

    ipcRenderer.on(
      IPC_CHANNELS.runtimeSettingsChanged,
      handleRuntimeSettingsChanged,
    );

    return () => {
      ipcRenderer.removeListener(
        IPC_CHANNELS.runtimeSettingsChanged,
        handleRuntimeSettingsChanged,
      );
    };
  },
});

contextBridge.exposeInMainWorld('psyduck', companionBridge);
