import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  powerMonitor,
  safeStorage,
  screen,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type Tray,
} from 'electron';
import { join } from 'node:path';

import { AIProviderError } from '../ai/AIProvider';
import { AIService, AIServiceError } from '../ai/AIService';
import {
  AssistantActionExecutionError,
  AssistantActionExecutor,
  AssistantActionParseError,
  AssistantActionResponseProcessor,
  createAssistantActionPrompt,
} from '../ai/actions';
import { GeminiProvider } from '../ai/providers/GeminiProvider';
import { GrokProvider } from '../ai/providers/GrokProvider';
import { OllamaProvider } from '../ai/providers/OllamaProvider';
import { OpenAIProvider } from '../ai/providers/OpenAIProvider';
import {
  LoopbackOllamaEndpointPolicy,
  OllamaEndpointPolicyError,
} from '../ai/providers/ollama/OllamaEndpointPolicy';
import { personalityService } from '../personality';
import { IPC_CHANNELS } from '../shared/events';
import {
  isPomodoroDuration,
  type PomodoroState,
} from '../shared/pomodoro';
import {
  cloneReminder,
  type ReminderFiredNotification,
} from '../shared/reminders';
import {
  type AiProviderSelection,
  normalizeUserName,
  parseAiConfigurationUpdate,
  parsePreferencesSettingsPatch,
  toPreferencesSettings,
  toRuntimeSettings,
  type AiConfigurationUpdate,
  type AppSettings,
  type PreferencesSettings,
  type PreferencesSettingsPatch,
  type RuntimeSettings,
  type SettingsPatch,
} from '../shared/settings';
import type {
  AIAskResult,
  AIConnectionTestResult,
  AIModelListResult,
  ScreenPoint,
} from '../shared/types';
import {
  createCompanionContextMenu,
  type ApplicationMenuActions,
} from './menus';
import {
  CredentialManager,
  CredentialStorageError,
} from './CredentialManager';
import { DailyPlannerService } from './DailyPlannerService';
import {
  AIRequestManager,
  AIRequestPolicyError,
} from './AIRequestManager';
import {
  IpcAuthorizer,
  type RendererRole,
} from './ipcAuthorization';
import {
  FilePomodoroPersistence,
  PomodoroManager,
} from './PomodoroManager';
import { createPreferencesWindow } from './preferencesWindow';
import type { ReminderFiredEvent } from './ReminderEvents';
import { ReminderScheduler } from './ReminderScheduler';
import { ReminderService } from './ReminderService';
import { getExpectedRendererUrl } from './rendererSecurity';
import { SettingsService } from './SettingsService';
import { createSystemTray } from './tray';
import {
  createMainWindow,
  setCompanionContentHeight,
} from './window';

const CURSOR_SAMPLE_INTERVAL_MS = 1_000 / 30;
const MAX_ABSOLUTE_WINDOW_COORDINATE = 100_000;
const MAX_COMPANION_CONTENT_HEIGHT = 10_000;
const MAX_AI_PROMPT_LENGTH = 4_096;
const SETTINGS_FILE_NAME = 'settings.json';
const POMODORO_FILE_NAME = 'pomodoro.json';
const API_KEY_PROVIDERS: ReadonlySet<AiProviderSelection> = new Set([
  'openai',
  'gemini',
  'grok',
]);
const ollamaEndpointPolicy = new LoopbackOllamaEndpointPolicy();
const aiRequestManager = new AIRequestManager();

let mainWindow: BrowserWindow | null = null;
let preferencesWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let settingsService: SettingsService | null = null;
let aiService: AIService | null = null;
let assistantActionResponseProcessor:
  | AssistantActionResponseProcessor
  | null = null;
let pomodoroManager: PomodoroManager | null = null;
let reminderScheduler: ReminderScheduler | null = null;
let reminderService: ReminderService | null = null;
let dailyPlannerService: DailyPlannerService | null = null;
let unsubscribeFromSettings: (() => void) | null = null;
let unsubscribeFromPomodoroState: (() => void) | null = null;
let unsubscribeFromPomodoroCompletion: (() => void) | null = null;
let unsubscribeFromReminderEvents: (() => void) | null = null;
let pendingPomodoroCompletion = false;
const pendingReminderNotifications: ReminderFiredNotification[] = [];
let customPomodoroPanelVisible = false;

const ipcAuthorizer = new IpcAuthorizer({
  getTarget: (role) => {
    const browserWindow =
      role === 'companion' ? mainWindow : preferencesWindow;

    return {
      browserWindow,
      expectedUrl:
        browserWindow === null
          ? null
          : getExpectedRendererUrl(browserWindow),
    };
  },
});

const getSettingsService = (): SettingsService => {
  if (settingsService === null) {
    throw new Error('Settings service is not initialized.');
  }

  return settingsService;
};

const getAIService = (): AIService => {
  if (aiService === null) {
    throw new Error('AI service is not initialized.');
  }

  return aiService;
};

const getAssistantActionResponseProcessor =
  (): AssistantActionResponseProcessor => {
    if (assistantActionResponseProcessor === null) {
      throw new Error('Assistant action processor is not initialized.');
    }

    return assistantActionResponseProcessor;
  };

const getPomodoroManager = (): PomodoroManager => {
  if (pomodoroManager === null) {
    throw new Error('Pomodoro manager is not initialized.');
  }

  return pomodoroManager;
};

const getReminderService = (): ReminderService => {
  if (reminderService === null) {
    throw new Error('Reminder service is not initialized.');
  }

  return reminderService;
};

const getDailyPlannerService = (): DailyPlannerService => {
  if (dailyPlannerService === null) {
    throw new Error('Daily planner service is not initialized.');
  }

  return dailyPlannerService;
};

const handleSystemResume = (): void => {
  void reminderScheduler?.resynchronize();
};

const createAIService = (): AIService =>
  new AIService([
    new OpenAIProvider(),
    new GeminiProvider(),
    new GrokProvider(),
    new OllamaProvider(),
  ]);

const synchronizeAISettings = (settings: AppSettings): Promise<void> => {
  if (aiService === null) {
    return Promise.resolve();
  }

  // Decrypt only for providers that require a credential. Ollama never
  // causes protected API-key material to enter the provider configuration.
  const apiKey = API_KEY_PROVIDERS.has(settings.ai.provider)
    ? getSettingsService().getApiKey()
    : '';

  return aiService.configure({
    enabled: settings.ai.enabled,
    provider: settings.ai.provider,
    model: settings.ai.model,
    apiKey,
    endpoint: settings.ai.endpoint,
  });
};

const isWindowPosition = (value: unknown): value is ScreenPoint => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const position = value as Record<string, unknown>;

  return (
    typeof position.x === 'number' &&
    Number.isFinite(position.x) &&
    Math.abs(position.x) <= MAX_ABSOLUTE_WINDOW_COORDINATE &&
    typeof position.y === 'number' &&
    Number.isFinite(position.y) &&
    Math.abs(position.y) <= MAX_ABSOLUTE_WINDOW_COORDINATE
  );
};

const handleMoveWindow = (event: IpcMainEvent, position: unknown): void => {
  if (!isWindowPosition(position)) {
    return;
  }

  const targetWindow = BrowserWindow.fromWebContents(event.sender);

  if (targetWindow === null || targetWindow.isDestroyed()) {
    return;
  }

  targetWindow.setPosition(
    Math.round(position.x),
    Math.round(position.y),
    false,
  );
};

const startCursorBroadcast = (targetWindow: BrowserWindow): void => {
  let lastPosition: ScreenPoint | null = null;
  let sampleTimer: ReturnType<typeof setInterval> | null = null;

  const sendCursorPosition = (): void => {
    if (
      targetWindow.isDestroyed() ||
      targetWindow.webContents.isDestroyed()
    ) {
      return;
    }

    const position = screen.getCursorScreenPoint();

    if (
      position.x === lastPosition?.x &&
      position.y === lastPosition.y
    ) {
      return;
    }

    lastPosition = position;
    targetWindow.webContents.send(IPC_CHANNELS.cursorPosition, position);
  };

  const beginSampling = (): void => {
    sendCursorPosition();
    sampleTimer = setInterval(
      sendCursorPosition,
      CURSOR_SAMPLE_INTERVAL_MS,
    );
  };

  if (targetWindow.webContents.isLoadingMainFrame()) {
    targetWindow.webContents.once('did-finish-load', beginSampling);
  } else {
    beginSampling();
  }

  targetWindow.once('closed', () => {
    if (sampleTimer !== null) {
      clearInterval(sampleTimer);
    }
  });
};

const bindAIRequestLifecycle = (
  targetWindow: BrowserWindow,
  rendererRole: RendererRole,
): void => {
  targetWindow.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) {
      aiRequestManager.cancelRole(rendererRole, 'renderer_reloaded');
    }
  });
  targetWindow.webContents.once('render-process-gone', () => {
    aiRequestManager.cancelRole(rendererRole, 'renderer_crashed');
  });
  targetWindow.once('closed', () => {
    aiRequestManager.cancelRole(rendererRole, 'window_closed');
  });
};

const sendPomodoroState = (
  targetWindow: BrowserWindow,
  state: PomodoroState,
): void => {
  if (
    targetWindow.isDestroyed() ||
    targetWindow.webContents.isDestroyed()
  ) {
    return;
  }

  targetWindow.webContents.send(
    IPC_CHANNELS.pomodoroStateChanged,
    state,
  );
};

const sendPendingPomodoroCompletion = (
  targetWindow: BrowserWindow,
): void => {
  if (
    !pendingPomodoroCompletion ||
    targetWindow.isDestroyed() ||
    targetWindow.webContents.isDestroyed()
  ) {
    return;
  }

  pendingPomodoroCompletion = false;
  targetWindow.webContents.send(IPC_CHANNELS.pomodoroCompleted);
};

const synchronizePomodoroRenderer = (
  targetWindow: BrowserWindow,
): void => {
  const state = getPomodoroManager().getState();
  sendPomodoroState(targetWindow, state);
  sendPendingPomodoroCompletion(targetWindow);

  if (customPomodoroPanelVisible) {
    targetWindow.webContents.send(
      IPC_CHANNELS.customPomodoroDurationRequested,
    );
  }
};

const handlePomodoroStateChange = (state: PomodoroState): void => {
  const targetWindow = mainWindow;

  if (targetWindow === null || targetWindow.isDestroyed()) {
    return;
  }

  if (!targetWindow.webContents.isLoadingMainFrame()) {
    sendPomodoroState(targetWindow, state);
  }
};

const handlePomodoroCompletion = (): void => {
  const targetWindow = mainWindow;

  if (
    targetWindow === null ||
    targetWindow.isDestroyed() ||
    targetWindow.webContents.isDestroyed() ||
    targetWindow.webContents.isLoadingMainFrame()
  ) {
    pendingPomodoroCompletion = true;
    return;
  }

  targetWindow.webContents.send(IPC_CHANNELS.pomodoroCompleted);
};

const flushPendingReminderNotifications = (
  targetWindow: BrowserWindow,
): void => {
  if (
    targetWindow.isDestroyed() ||
    targetWindow.webContents.isDestroyed() ||
    targetWindow.webContents.isLoadingMainFrame()
  ) {
    return;
  }

  while (pendingReminderNotifications.length > 0) {
    const notification = pendingReminderNotifications[0];

    if (notification === undefined) {
      return;
    }

    try {
      targetWindow.webContents.send(
        IPC_CHANNELS.reminderFired,
        notification,
      );
      pendingReminderNotifications.shift();
    } catch (error) {
      console.error('[reminders] renderer_delivery_failed', error);
      return;
    }
  }
};

const handleReminderFired = (event: ReminderFiredEvent): void => {
  pendingReminderNotifications.push({
    reminder: cloneReminder(event.reminder),
    firedAt: event.firedAt,
    overdue: event.overdue,
  });

  const targetWindow = mainWindow;

  if (targetWindow !== null && !targetWindow.isDestroyed()) {
    flushPendingReminderNotifications(targetWindow);
  }
};

const openMainWindow = (): BrowserWindow => {
  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  const alwaysOnTop =
    getSettingsService().get().general.alwaysOnTop;
  const nextMainWindow = createMainWindow(alwaysOnTop);
  mainWindow = nextMainWindow;
  bindAIRequestLifecycle(nextMainWindow, 'companion');
  startCursorBroadcast(nextMainWindow);
  const resetCustomPanelSurface = (): void => {
    if (!customPomodoroPanelVisible || nextMainWindow.isDestroyed()) {
      return;
    }

    customPomodoroPanelVisible = false;
  };
  nextMainWindow.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) {
      resetCustomPanelSurface();
    }
  });
  nextMainWindow.webContents.on(
    'render-process-gone',
    resetCustomPanelSurface,
  );
  nextMainWindow.webContents.on('did-finish-load', () => {
    synchronizePomodoroRenderer(nextMainWindow);
    flushPendingReminderNotifications(nextMainWindow);
  });

  nextMainWindow.once('closed', () => {
    if (mainWindow === nextMainWindow) {
      mainWindow = null;
      customPomodoroPanelVisible = false;
    }
  });

  return nextMainWindow;
};

const showMainWindow = (): void => {
  const targetWindow = openMainWindow();
  targetWindow.show();
  targetWindow.focus();
};

const openPreferences = (): void => {
  if (
    preferencesWindow !== null &&
    !preferencesWindow.isDestroyed()
  ) {
    preferencesWindow.show();
    preferencesWindow.focus();
    return;
  }

  const nextPreferencesWindow = createPreferencesWindow();
  preferencesWindow = nextPreferencesWindow;
  bindAIRequestLifecycle(nextPreferencesWindow, 'preferences');

  nextPreferencesWindow.once('closed', () => {
    if (preferencesWindow === nextPreferencesWindow) {
      preferencesWindow = null;
    }
  });
};

const restartApplication = (): void => {
  aiRequestManager.cancelAll('application_quit');
  pomodoroManager?.dispose();
  app.relaunch();
  app.exit(0);
};

const quitApplication = (): void => {
  app.quit();
};

const updateSettings = (patch: SettingsPatch): void => {
  void getSettingsService().update(patch).catch((error: unknown) => {
    console.error('[settings] update_failed', error);
  });
};

const requestCustomPomodoroDuration = (): void => {
  const targetWindow = openMainWindow();
  customPomodoroPanelVisible = true;
  targetWindow.show();
  targetWindow.focus();

  if (!targetWindow.webContents.isLoadingMainFrame()) {
    targetWindow.webContents.send(
      IPC_CHANNELS.customPomodoroDurationRequested,
    );
  }
};

const requestUserName = (): void => {
  const targetWindow = openMainWindow();
  targetWindow.show();
  targetWindow.focus();

  const sendRequest = (): void => {
    if (
      targetWindow.isDestroyed() ||
      targetWindow.webContents.isDestroyed()
    ) {
      return;
    }

    targetWindow.webContents.send(IPC_CHANNELS.userNamePanelRequested);
  };

  if (targetWindow.webContents.isLoadingMainFrame()) {
    targetWindow.webContents.once('did-finish-load', sendRequest);
  } else {
    sendRequest();
  }
};

const requestStickyMessage = (): void => {
  const targetWindow = openMainWindow();
  targetWindow.show();
  targetWindow.focus();

  const sendRequest = (): void => {
    if (
      targetWindow.isDestroyed() ||
      targetWindow.webContents.isDestroyed()
    ) {
      return;
    }

    targetWindow.webContents.send(
      IPC_CHANNELS.stickyMessagePanelRequested,
    );
  };

  if (targetWindow.webContents.isLoadingMainFrame()) {
    targetWindow.webContents.once('did-finish-load', sendRequest);
  } else {
    sendRequest();
  }
};

const requestReminderCreation = (): void => {
  const targetWindow = openMainWindow();
  targetWindow.show();
  targetWindow.focus();

  const sendRequest = (): void => {
    if (
      targetWindow.isDestroyed() ||
      targetWindow.webContents.isDestroyed()
    ) {
      return;
    }

    targetWindow.webContents.send(
      IPC_CHANNELS.reminderCreationPanelRequested,
    );
  };

  if (targetWindow.webContents.isLoadingMainFrame()) {
    targetWindow.webContents.once('did-finish-load', sendRequest);
  } else {
    sendRequest();
  }
};

const requestReminderManagement = (): void => {
  const targetWindow = openMainWindow();
  targetWindow.show();
  targetWindow.focus();

  const sendRequest = (): void => {
    if (
      targetWindow.isDestroyed() ||
      targetWindow.webContents.isDestroyed()
    ) {
      return;
    }

    targetWindow.webContents.send(
      IPC_CHANNELS.reminderManagerPanelRequested,
    );
  };

  if (targetWindow.webContents.isLoadingMainFrame()) {
    targetWindow.webContents.once('did-finish-load', sendRequest);
  } else {
    sendRequest();
  }
};

const requestDailyPlanner = (): void => {
  const targetWindow = openMainWindow();
  targetWindow.show();
  targetWindow.focus();

  const sendRequest = (): void => {
    if (
      targetWindow.isDestroyed() ||
      targetWindow.webContents.isDestroyed()
    ) {
      return;
    }

    targetWindow.webContents.send(
      IPC_CHANNELS.dailyPlannerPanelRequested,
    );
  };

  if (targetWindow.webContents.isLoadingMainFrame()) {
    targetWindow.webContents.once('did-finish-load', sendRequest);
  } else {
    sendRequest();
  }
};

const getMenuActions = (): ApplicationMenuActions => ({
  showCompanion: showMainWindow,
  openPreferences,
  restart: restartApplication,
  quit: quitApplication,
  updateSettings,
  getPomodoroState: () => getPomodoroManager().getState(),
  startPomodoro: (durationMinutes) => {
    getPomodoroManager().start(durationMinutes);
  },
  pausePomodoro: () => {
    getPomodoroManager().pause();
  },
  resumePomodoro: () => {
    getPomodoroManager().resume();
  },
  stopPomodoro: () => {
    getPomodoroManager().stop();
  },
  requestCustomPomodoroDuration,
  requestUserName,
  requestStickyMessage,
  requestReminderCreation,
  requestReminderManagement,
  requestDailyPlanner,
});

const handleShowCompanionContextMenu = (
  _event: IpcMainEvent,
): void => {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    return;
  }

  createCompanionContextMenu(
    getSettingsService().get(),
    getMenuActions(),
  ).popup({ window: mainWindow });
};

const broadcastRuntimeSettings = (settings: AppSettings): void => {
  // Broadcast only the explicit secret-free projection, never AppSettings.
  const runtimeSettings = toRuntimeSettings(settings);

  for (const targetWindow of [mainWindow, preferencesWindow]) {
    if (
      targetWindow !== null &&
      !targetWindow.isDestroyed() &&
      !targetWindow.webContents.isDestroyed()
    ) {
      targetWindow.webContents.send(
        IPC_CHANNELS.runtimeSettingsChanged,
        runtimeSettings,
      );
    }
  }
};

const applyRuntimeSettings = (settings: AppSettings): void => {
  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(settings.general.alwaysOnTop);
  }

  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: settings.general.launchAtStartup,
    });
  }
};

const handleGetCursorPosition = (
  _event: IpcMainInvokeEvent,
): ScreenPoint => {
  return screen.getCursorScreenPoint();
};

const handleGetRuntimeSettings = (
  _event: IpcMainInvokeEvent,
): RuntimeSettings => {
  return toRuntimeSettings(getSettingsService().get());
};

const handleUpdateUserName = async (
  _event: IpcMainInvokeEvent,
  value: unknown,
): Promise<string> => {
  const userName = normalizeUserName(value);

  if (userName === null) {
    throw new TypeError('Invalid user name.');
  }

  const settings = await getSettingsService().update({ userName });
  return settings.userName;
};

const handleUpdateStickyMessage = async (
  _event: IpcMainInvokeEvent,
  value: unknown,
): Promise<string | null> =>
  getSettingsService().updateStickyMessage(value);

const handleCreateReminder = (
  _event: IpcMainInvokeEvent,
  value: unknown,
) => getReminderService().createReminder(value);

const handleUpdateReminder = (
  _event: IpcMainInvokeEvent,
  id: unknown,
  value: unknown,
) => getReminderService().updateReminder(id, value);

const handleDeleteReminder = (
  _event: IpcMainInvokeEvent,
  id: unknown,
) => getReminderService().deleteReminder(id);

const handleGetReminder = (
  _event: IpcMainInvokeEvent,
  id: unknown,
) => getReminderService().getReminder(id);

const handleListReminders = (_event: IpcMainInvokeEvent) =>
  getReminderService().listReminders();

const handleMarkReminderCompleted = (
  _event: IpcMainInvokeEvent,
  id: unknown,
) => getReminderService().markCompleted(id);

const handleGetDailyPlanner = (_event: IpcMainInvokeEvent) =>
  getDailyPlannerService().getBriefing(
    getSettingsService().get().userName,
  );

const handleSetCompanionContentHeight = (
  event: IpcMainEvent,
  value: unknown,
): void => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > MAX_COMPANION_CONTENT_HEIGHT
  ) {
    return;
  }

  const targetWindow = BrowserWindow.fromWebContents(event.sender);

  if (targetWindow === null || targetWindow.isDestroyed()) {
    return;
  }

  setCompanionContentHeight(targetWindow, value);
};

const handleStartPomodoro = (
  _event: IpcMainInvokeEvent,
  value: unknown,
): void => {
  if (!isPomodoroDuration(value)) {
    throw new TypeError('Invalid Pomodoro duration.');
  }

  getPomodoroManager().start(value);
};

const handleCustomPomodoroPanelClosed = (
  _event: IpcMainEvent,
): void => {
  customPomodoroPanelVisible = false;

  if (mainWindow === null || mainWindow.isDestroyed()) {
    return;
  }
};

const handleGetPreferencesSettings = (
  _event: IpcMainInvokeEvent,
): PreferencesSettings => {
  return toPreferencesSettings(getSettingsService().get());
};

const handleUpdatePreferencesSettings = async (
  _event: IpcMainInvokeEvent,
  value: unknown,
): Promise<PreferencesSettings> => {
  const patch: PreferencesSettingsPatch | null =
    parsePreferencesSettingsPatch(value);

  if (patch === null) {
    throw new TypeError('Invalid settings update.');
  }

  const settings = await getSettingsService().update(patch);
  return toPreferencesSettings(settings);
};

const handleUpdateAiConfiguration = async (
  _event: IpcMainInvokeEvent,
  value: unknown,
): Promise<PreferencesSettings> => {
  const configuration: AiConfigurationUpdate | null =
    parseAiConfigurationUpdate(value);

  if (configuration === null) {
    throw new TypeError('Invalid AI configuration update.');
  }

  const currentAiSettings = getSettingsService().get().ai;
  const nextProvider =
    configuration.provider ?? currentAiSettings.provider;

  if (nextProvider === 'ollama') {
    const nextEndpoint =
      configuration.endpoint ?? currentAiSettings.endpoint;

    try {
      ollamaEndpointPolicy.parse(nextEndpoint);
    } catch (error) {
      console.warn('[security] ollama_endpoint_rejected', {
        operation: 'settings_update',
        reason:
          error instanceof OllamaEndpointPolicyError
            ? error.code
            : 'validation_failed',
      });
      throw new TypeError(
        'Ollama only supports local endpoints using localhost or 127.0.0.1.',
      );
    }
  }

  let settings: AppSettings;
  const configurationChanged =
    (configuration.enabled !== undefined &&
      configuration.enabled !== currentAiSettings.enabled) ||
    (configuration.provider !== undefined &&
      configuration.provider !== currentAiSettings.provider) ||
    (configuration.model !== undefined &&
      configuration.model !== currentAiSettings.model) ||
    (configuration.endpoint !== undefined &&
      configuration.endpoint !== currentAiSettings.endpoint) ||
    configuration.apiKey !== undefined;

  try {
    settings =
      await getSettingsService().updateAiConfiguration(configuration);
  } catch (error) {
    if (error instanceof CredentialStorageError) {
      console.warn(
        `[security] credential_update_rejected: ${error.code}; the existing credential was preserved.`,
      );
    }

    throw error;
  }

  if (configurationChanged) {
    aiRequestManager.cancelAll('provider_changed');
  }

  await synchronizeAISettings(settings);
  return toPreferencesSettings(settings);
};

const getAIServiceErrorMessage = (error: unknown): string => {
  if (error instanceof AIServiceError) {
    return error.code === 'empty_prompt'
      ? personalityService.getErrorMessage()
      : personalityService.getAIUnavailableMessage();
  }

  if (error instanceof AIProviderError) {
    return personalityService.getProviderFailedMessage();
  }

  return personalityService.getErrorMessage();
};

const logUnexpectedAIError = (operation: string, error: unknown): void => {
  if (error instanceof AIServiceError || error instanceof AIProviderError) {
    return;
  }

  console.error(`[ai] ${operation}_failed`, {
    name: error instanceof Error ? error.name : 'UnknownError',
  });
};

const getAIRequestPolicyMessage = (error: unknown): string | null =>
  error instanceof AIRequestPolicyError ? error.message : null;

const logAssistantActionFailure = (error: unknown): void => {
  const code =
    error instanceof AssistantActionParseError
      ? error.code
      : error instanceof AssistantActionExecutionError
        ? 'unregistered_action'
        : 'service_rejected';

  console.warn('[ai-action] action_rejected', { code });
};

const handleAskAI = async (
  _event: IpcMainInvokeEvent,
  value: unknown,
): Promise<AIAskResult> => {
  try {
    return await aiRequestManager.run(
      'companion',
      'chat',
      async (signal) => {
        if (typeof value !== 'string') {
          throw new TypeError('AI prompt must be a string.');
        }

        const prompt = value.trim();

        if (prompt.length === 0) {
          throw new TypeError('AI prompt must not be empty.');
        }

        if (prompt.length > MAX_AI_PROMPT_LENGTH) {
          throw new RangeError(
            `AI prompt must not exceed ${MAX_AI_PROMPT_LENGTH} characters.`,
          );
        }

        try {
          const response = await getAIService().ask(
            createAssistantActionPrompt(prompt),
            { signal },
          );

          try {
            // Provider output is untrusted until the action parser and
            // executor allowlist have both accepted it.
            const processedResponse =
              await getAssistantActionResponseProcessor().process(
                response,
              );
            return { ok: true, response: processedResponse };
          } catch (error) {
            logAssistantActionFailure(error);
            return {
              ok: false,
              message:
                personalityService.getAssistantActionFailedMessage(),
            };
          }
        } catch (error) {
          logUnexpectedAIError('request', error);
          return {
            ok: false,
            message: getAIServiceErrorMessage(error),
          };
        }
      },
    );
  } catch (error) {
    const policyMessage = getAIRequestPolicyMessage(error);

    if (policyMessage !== null) {
      return { ok: false, message: policyMessage };
    }

    throw error;
  }
};

const handleListAIModels = async (
  _event: IpcMainInvokeEvent,
): Promise<AIModelListResult> => {
  try {
    return await aiRequestManager.run(
      'preferences',
      'model_discovery',
      async (signal) => {
        try {
          const models = await getAIService().listModels({ signal });
          return { ok: true, models };
        } catch (error) {
          logUnexpectedAIError('model_list', error);
          return {
            ok: false,
            message: getAIServiceErrorMessage(error),
          };
        }
      },
    );
  } catch (error) {
    const policyMessage = getAIRequestPolicyMessage(error);

    if (policyMessage !== null) {
      return { ok: false, message: policyMessage };
    }

    throw error;
  }
};

const handleTestAIConnection = async (
  _event: IpcMainInvokeEvent,
): Promise<AIConnectionTestResult> => {
  try {
    return await aiRequestManager.run(
      'preferences',
      'connection_test',
      async (signal) => {
        try {
          const result =
            await getAIService().testConnection({ signal });
          return { ok: true, ...result };
        } catch (error) {
          logUnexpectedAIError('connection_test', error);
          return {
            ok: false,
            message: getAIServiceErrorMessage(error),
          };
        }
      },
    );
  } catch (error) {
    const policyMessage = getAIRequestPolicyMessage(error);

    if (policyMessage !== null) {
      return { ok: false, message: policyMessage };
    }

    throw error;
  }
};

const authorizedMoveWindowHandler = ipcAuthorizer.protectEvent(
  IPC_CHANNELS.moveWindow,
  handleMoveWindow,
);
const authorizedContentHeightHandler = ipcAuthorizer.protectEvent(
  IPC_CHANNELS.setCompanionContentHeight,
  handleSetCompanionContentHeight,
);
const authorizedContextMenuHandler = ipcAuthorizer.protectEvent(
  IPC_CHANNELS.showCompanionContextMenu,
  handleShowCompanionContextMenu,
);
const authorizedCustomPomodoroPanelClosedHandler =
  ipcAuthorizer.protectEvent(
    IPC_CHANNELS.customPomodoroPanelClosed,
    handleCustomPomodoroPanelClosed,
  );

const registerIpcHandlers = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.getCursorPosition,
    ipcAuthorizer.protectInvoke(
      IPC_CHANNELS.getCursorPosition,
      handleGetCursorPosition,
    ),
  );
  ipcMain.handle(
    IPC_CHANNELS.getRuntimeSettings,
    ipcAuthorizer.protectInvoke(
      IPC_CHANNELS.getRuntimeSettings,
      handleGetRuntimeSettings,
    ),
  );
  ipcMain.handle(
    IPC_CHANNELS.updateUserName,
    ipcAuthorizer.protectInvoke(
      IPC_CHANNELS.updateUserName,
      handleUpdateUserName,
    ),
  );
  ipcMain.handle(
    IPC_CHANNELS.updateStickyMessage,
    ipcAuthorizer.protectInvoke(
      IPC_CHANNELS.updateStickyMessage,
      handleUpdateStickyMessage,
    ),
  );
  ipcMain.handle(
    IPC_CHANNELS.startPomodoro,
    ipcAuthorizer.protectInvoke(
      IPC_CHANNELS.startPomodoro,
      handleStartPomodoro,
    ),
  );
  ipcMain.handle(
    IPC_CHANNELS.createReminder,
    ipcAuthorizer.protectInvoke(
      IPC_CHANNELS.createReminder,
      handleCreateReminder,
    ),
  );
  ipcMain.handle(
    IPC_CHANNELS.updateReminder,
    ipcAuthorizer.protectInvoke(
      IPC_CHANNELS.updateReminder,
      handleUpdateReminder,
    ),
  );
  ipcMain.handle(
    IPC_CHANNELS.deleteReminder,
    ipcAuthorizer.protectInvoke(
      IPC_CHANNELS.deleteReminder,
      handleDeleteReminder,
    ),
  );
  ipcMain.handle(
    IPC_CHANNELS.getReminder,
    ipcAuthorizer.protectInvoke(
      IPC_CHANNELS.getReminder,
      handleGetReminder,
    ),
  );
  ipcMain.handle(
    IPC_CHANNELS.listReminders,
    ipcAuthorizer.protectInvoke(
      IPC_CHANNELS.listReminders,
      handleListReminders,
    ),
  );
  ipcMain.handle(
    IPC_CHANNELS.markReminderCompleted,
    ipcAuthorizer.protectInvoke(
      IPC_CHANNELS.markReminderCompleted,
      handleMarkReminderCompleted,
    ),
  );
  ipcMain.handle(
    IPC_CHANNELS.getDailyPlanner,
    ipcAuthorizer.protectInvoke(
      IPC_CHANNELS.getDailyPlanner,
      handleGetDailyPlanner,
    ),
  );
  ipcMain.handle(
    IPC_CHANNELS.getPreferencesSettings,
    ipcAuthorizer.protectInvoke(
      IPC_CHANNELS.getPreferencesSettings,
      handleGetPreferencesSettings,
    ),
  );
  ipcMain.handle(
    IPC_CHANNELS.updatePreferencesSettings,
    ipcAuthorizer.protectInvoke(
      IPC_CHANNELS.updatePreferencesSettings,
      handleUpdatePreferencesSettings,
    ),
  );
  ipcMain.handle(
    IPC_CHANNELS.updateAiConfiguration,
    ipcAuthorizer.protectInvoke(
      IPC_CHANNELS.updateAiConfiguration,
      handleUpdateAiConfiguration,
    ),
  );
  ipcMain.handle(
    IPC_CHANNELS.askAI,
    ipcAuthorizer.protectInvoke(IPC_CHANNELS.askAI, handleAskAI),
  );
  ipcMain.handle(
    IPC_CHANNELS.listAIModels,
    ipcAuthorizer.protectInvoke(
      IPC_CHANNELS.listAIModels,
      handleListAIModels,
    ),
  );
  ipcMain.handle(
    IPC_CHANNELS.testAIConnection,
    ipcAuthorizer.protectInvoke(
      IPC_CHANNELS.testAIConnection,
      handleTestAIConnection,
    ),
  );
  ipcMain.on(IPC_CHANNELS.moveWindow, authorizedMoveWindowHandler);
  ipcMain.on(
    IPC_CHANNELS.setCompanionContentHeight,
    authorizedContentHeightHandler,
  );
  ipcMain.on(
    IPC_CHANNELS.showCompanionContextMenu,
    authorizedContextMenuHandler,
  );
  ipcMain.on(
    IPC_CHANNELS.customPomodoroPanelClosed,
    authorizedCustomPomodoroPanelClosedHandler,
  );
};

const unregisterIpcHandlers = (): void => {
  ipcMain.removeHandler(IPC_CHANNELS.getCursorPosition);
  ipcMain.removeHandler(IPC_CHANNELS.getRuntimeSettings);
  ipcMain.removeHandler(IPC_CHANNELS.updateUserName);
  ipcMain.removeHandler(IPC_CHANNELS.updateStickyMessage);
  ipcMain.removeHandler(IPC_CHANNELS.startPomodoro);
  ipcMain.removeHandler(IPC_CHANNELS.createReminder);
  ipcMain.removeHandler(IPC_CHANNELS.updateReminder);
  ipcMain.removeHandler(IPC_CHANNELS.deleteReminder);
  ipcMain.removeHandler(IPC_CHANNELS.getReminder);
  ipcMain.removeHandler(IPC_CHANNELS.listReminders);
  ipcMain.removeHandler(IPC_CHANNELS.markReminderCompleted);
  ipcMain.removeHandler(IPC_CHANNELS.getDailyPlanner);
  ipcMain.removeHandler(IPC_CHANNELS.getPreferencesSettings);
  ipcMain.removeHandler(IPC_CHANNELS.updatePreferencesSettings);
  ipcMain.removeHandler(IPC_CHANNELS.updateAiConfiguration);
  ipcMain.removeHandler(IPC_CHANNELS.askAI);
  ipcMain.removeHandler(IPC_CHANNELS.listAIModels);
  ipcMain.removeHandler(IPC_CHANNELS.testAIConnection);
  ipcMain.removeListener(
    IPC_CHANNELS.moveWindow,
    authorizedMoveWindowHandler,
  );
  ipcMain.removeListener(
    IPC_CHANNELS.setCompanionContentHeight,
    authorizedContentHeightHandler,
  );
  ipcMain.removeListener(
    IPC_CHANNELS.showCompanionContextMenu,
    authorizedContextMenuHandler,
  );
  ipcMain.removeListener(
    IPC_CHANNELS.customPomodoroPanelClosed,
    authorizedCustomPomodoroPanelClosedHandler,
  );
};

Menu.setApplicationMenu(null);

void app.whenReady().then(async () => {
  const credentialManager = new CredentialManager(safeStorage);

  if (!credentialManager.isEncryptionAvailable()) {
    console.warn(
      '[security] safe_storage_unavailable: API credentials cannot be saved or decrypted securely. Existing credential data will remain untouched.',
    );
  }

  settingsService = new SettingsService(
    join(app.getPath('userData'), SETTINGS_FILE_NAME),
    credentialManager,
  );

  try {
    await settingsService.load();
  } catch (error) {
    console.error('[settings] load_failed', error);
  }

  reminderService = new ReminderService(settingsService);
  dailyPlannerService = new DailyPlannerService(reminderService);
  assistantActionResponseProcessor = new AssistantActionResponseProcessor(
    new AssistantActionExecutor({
      reminderService,
      settingsService,
      messages: personalityService,
    }),
  );
  reminderScheduler = new ReminderScheduler(reminderService);
  unsubscribeFromReminderEvents =
    reminderScheduler.subscribe(handleReminderFired);
  powerMonitor.on('resume', handleSystemResume);
  await reminderScheduler.start();
  aiService = createAIService();
  pomodoroManager = new PomodoroManager({
    persistence: new FilePomodoroPersistence(
      join(app.getPath('userData'), POMODORO_FILE_NAME),
    ),
  });
  unsubscribeFromPomodoroState = pomodoroManager.subscribe(
    handlePomodoroStateChange,
  );
  unsubscribeFromPomodoroCompletion = pomodoroManager.onComplete(
    handlePomodoroCompletion,
  );

  await pomodoroManager.load();

  try {
    await synchronizeAISettings(settingsService.get());
  } catch (error) {
    logUnexpectedAIError('configuration', error);
  }

  registerIpcHandlers();
  applyRuntimeSettings(settingsService.get());
  openMainWindow();

  try {
    tray = createSystemTray(getMenuActions());
  } catch (error) {
    console.error('[tray] create_failed', error);
  }

  unsubscribeFromSettings = settingsService.subscribe((settings) => {
    applyRuntimeSettings(settings);
    broadcastRuntimeSettings(settings);
  });

  app.on('activate', showMainWindow);
});

app.once('before-quit', () => {
  app.removeListener('activate', showMainWindow);
  powerMonitor.removeListener('resume', handleSystemResume);
  reminderScheduler?.stop();
  reminderScheduler = null;
  unsubscribeFromReminderEvents?.();
  unsubscribeFromReminderEvents = null;
  pendingReminderNotifications.length = 0;
  aiRequestManager.cancelAll('application_quit');
  unsubscribeFromSettings?.();
  unsubscribeFromSettings = null;
  unsubscribeFromPomodoroState?.();
  unsubscribeFromPomodoroState = null;
  unsubscribeFromPomodoroCompletion?.();
  unsubscribeFromPomodoroCompletion = null;
  pomodoroManager?.dispose();
  pomodoroManager = null;
  assistantActionResponseProcessor = null;
  dailyPlannerService = null;
  reminderService = null;
  const activeAIService = aiService;
  aiService = null;
  void activeAIService?.dispose().catch((error: unknown) => {
    logUnexpectedAIError('dispose', error);
  });
  unregisterIpcHandlers();
  tray?.destroy();
  tray = null;
});
