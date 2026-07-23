import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  safeStorage,
  screen,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type Tray,
} from 'electron';
import { join } from 'node:path';

import { AIProviderError } from '../ai/AIProvider';
import { AIService, AIServiceError } from '../ai/AIService';
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
import type { PomodoroState } from '../shared/pomodoro';
import {
  type AiProviderSelection,
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
import { requestCustomPomodoroDuration } from './pomodoroDurationDialog';
import { createPreferencesWindow } from './preferencesWindow';
import { getExpectedRendererUrl } from './rendererSecurity';
import { SettingsService } from './SettingsService';
import { createSystemTray } from './tray';
import {
  createMainWindow,
  setPomodoroWidgetSpace,
} from './window';

const CURSOR_SAMPLE_INTERVAL_MS = 1_000 / 30;
const MAX_ABSOLUTE_WINDOW_COORDINATE = 100_000;
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
let pomodoroManager: PomodoroManager | null = null;
let unsubscribeFromSettings: (() => void) | null = null;
let unsubscribeFromPomodoroState: (() => void) | null = null;
let unsubscribeFromPomodoroCompletion: (() => void) | null = null;
let pendingPomodoroCompletion = false;

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

const getPomodoroManager = (): PomodoroManager => {
  if (pomodoroManager === null) {
    throw new Error('Pomodoro manager is not initialized.');
  }

  return pomodoroManager;
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
  setPomodoroWidgetSpace(targetWindow, state.running);
  sendPomodoroState(targetWindow, state);
  sendPendingPomodoroCompletion(targetWindow);
};

const handlePomodoroStateChange = (state: PomodoroState): void => {
  const targetWindow = mainWindow;

  if (targetWindow === null || targetWindow.isDestroyed()) {
    return;
  }

  setPomodoroWidgetSpace(targetWindow, state.running);

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

const openMainWindow = (): BrowserWindow => {
  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  const alwaysOnTop =
    getSettingsService().get().general.alwaysOnTop;
  const pomodoroState = getPomodoroManager().getState();
  const nextMainWindow = createMainWindow(
    alwaysOnTop,
    pomodoroState.running,
  );
  mainWindow = nextMainWindow;
  bindAIRequestLifecycle(nextMainWindow, 'companion');
  startCursorBroadcast(nextMainWindow);
  nextMainWindow.webContents.on('did-finish-load', () => {
    synchronizePomodoroRenderer(nextMainWindow);
  });

  nextMainWindow.once('closed', () => {
    if (mainWindow === nextMainWindow) {
      mainWindow = null;
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

const selectCustomPomodoroDuration = async (): Promise<void> => {
  const manager = getPomodoroManager();
  const duration = await requestCustomPomodoroDuration(
    manager.getState().selectedDurationMinutes,
  );

  if (duration !== null) {
    manager.setDuration(duration);
  }
};

const getMenuActions = (): ApplicationMenuActions => ({
  showCompanion: showMainWindow,
  openPreferences,
  restart: restartApplication,
  quit: quitApplication,
  updateSettings,
  getPomodoroState: () => getPomodoroManager().getState(),
  startPomodoro: () => {
    getPomodoroManager().start();
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
  setPomodoroDuration: (durationMinutes) => {
    getPomodoroManager().setDuration(durationMinutes);
  },
  selectCustomPomodoroDuration,
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
          const response = await getAIService().ask(prompt, { signal });
          return { ok: true, response };
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
const authorizedContextMenuHandler = ipcAuthorizer.protectEvent(
  IPC_CHANNELS.showCompanionContextMenu,
  handleShowCompanionContextMenu,
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
    IPC_CHANNELS.showCompanionContextMenu,
    authorizedContextMenuHandler,
  );
};

const unregisterIpcHandlers = (): void => {
  ipcMain.removeHandler(IPC_CHANNELS.getCursorPosition);
  ipcMain.removeHandler(IPC_CHANNELS.getRuntimeSettings);
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
    IPC_CHANNELS.showCompanionContextMenu,
    authorizedContextMenuHandler,
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
  aiRequestManager.cancelAll('application_quit');
  unsubscribeFromSettings?.();
  unsubscribeFromSettings = null;
  unsubscribeFromPomodoroState?.();
  unsubscribeFromPomodoroState = null;
  unsubscribeFromPomodoroCompletion?.();
  unsubscribeFromPomodoroCompletion = null;
  pomodoroManager?.dispose();
  pomodoroManager = null;
  const activeAIService = aiService;
  aiService = null;
  void activeAIService?.dispose().catch((error: unknown) => {
    logUnexpectedAIError('dispose', error);
  });
  unregisterIpcHandlers();
  tray?.destroy();
  tray = null;
});
