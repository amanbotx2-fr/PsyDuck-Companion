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
  type WebContents,
} from 'electron';
import { join } from 'node:path';

import { AIProviderError } from '../ai/AIProvider';
import { AIService, AIServiceError } from '../ai/AIService';
import { GeminiProvider } from '../ai/providers/GeminiProvider';
import { GrokProvider } from '../ai/providers/GrokProvider';
import { OllamaProvider } from '../ai/providers/OllamaProvider';
import { OpenAIProvider } from '../ai/providers/OpenAIProvider';
import { personalityService } from '../personality';
import { IPC_CHANNELS } from '../shared/events';
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
import { createPreferencesWindow } from './preferencesWindow';
import { SettingsService } from './SettingsService';
import { createSystemTray } from './tray';
import { createMainWindow } from './window';

const CURSOR_SAMPLE_INTERVAL_MS = 1_000 / 30;
const MAX_ABSOLUTE_WINDOW_COORDINATE = 100_000;
const MAX_AI_PROMPT_LENGTH = 4_096;
const SETTINGS_FILE_NAME = 'settings.json';
const API_KEY_PROVIDERS: ReadonlySet<AiProviderSelection> = new Set([
  'openai',
  'gemini',
  'grok',
]);

let mainWindow: BrowserWindow | null = null;
let preferencesWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let settingsService: SettingsService | null = null;
let aiService: AIService | null = null;
let unsubscribeFromSettings: (() => void) | null = null;

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

const isCompanionRenderer = (sender: WebContents): boolean =>
  BrowserWindow.fromWebContents(sender) === mainWindow;

const isPreferencesRenderer = (sender: WebContents): boolean =>
  BrowserWindow.fromWebContents(sender) === preferencesWindow;

const handleMoveWindow = (event: IpcMainEvent, position: unknown): void => {
  if (!isCompanionRenderer(event.sender) || !isWindowPosition(position)) {
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

const openMainWindow = (): BrowserWindow => {
  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  const alwaysOnTop =
    getSettingsService().get().general.alwaysOnTop;
  const nextMainWindow = createMainWindow(alwaysOnTop);
  mainWindow = nextMainWindow;
  startCursorBroadcast(nextMainWindow);

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

  nextPreferencesWindow.once('closed', () => {
    if (preferencesWindow === nextPreferencesWindow) {
      preferencesWindow = null;
    }
  });
};

const restartApplication = (): void => {
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

const getMenuActions = (): ApplicationMenuActions => ({
  showCompanion: showMainWindow,
  openPreferences,
  restart: restartApplication,
  quit: quitApplication,
  updateSettings,
});

const handleShowCompanionContextMenu = (event: IpcMainEvent): void => {
  if (
    !isCompanionRenderer(event.sender) ||
    mainWindow === null ||
    mainWindow.isDestroyed()
  ) {
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
  event: IpcMainInvokeEvent,
): ScreenPoint => {
  if (!isCompanionRenderer(event.sender)) {
    throw new Error('Cursor position is unavailable to this window.');
  }

  return screen.getCursorScreenPoint();
};

const handleGetRuntimeSettings = (
  event: IpcMainInvokeEvent,
): RuntimeSettings => {
  if (!isCompanionRenderer(event.sender)) {
    throw new Error('Runtime settings are unavailable to this window.');
  }

  return toRuntimeSettings(getSettingsService().get());
};

const handleGetPreferencesSettings = (
  event: IpcMainInvokeEvent,
): PreferencesSettings => {
  if (!isPreferencesRenderer(event.sender)) {
    throw new Error('Preferences settings are unavailable to this window.');
  }

  return toPreferencesSettings(getSettingsService().get());
};

const handleUpdatePreferencesSettings = async (
  event: IpcMainInvokeEvent,
  value: unknown,
): Promise<PreferencesSettings> => {
  if (!isPreferencesRenderer(event.sender)) {
    throw new Error('Preferences updates are unavailable to this window.');
  }

  const patch: PreferencesSettingsPatch | null =
    parsePreferencesSettingsPatch(value);

  if (patch === null) {
    throw new TypeError('Invalid settings update.');
  }

  const settings = await getSettingsService().update(patch);
  return toPreferencesSettings(settings);
};

const handleUpdateAiConfiguration = async (
  event: IpcMainInvokeEvent,
  value: unknown,
): Promise<PreferencesSettings> => {
  if (!isPreferencesRenderer(event.sender)) {
    throw new Error('AI configuration is unavailable to this window.');
  }

  const configuration: AiConfigurationUpdate | null =
    parseAiConfigurationUpdate(value);

  if (configuration === null) {
    throw new TypeError('Invalid AI configuration update.');
  }

  let settings: AppSettings;

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
    message: error instanceof Error ? error.message : 'Unknown failure',
  });
};

const handleAskAI = async (
  event: IpcMainInvokeEvent,
  value: unknown,
): Promise<AIAskResult> => {
  if (!isCompanionRenderer(event.sender)) {
    throw new Error('AI requests are unavailable to this window.');
  }

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
    const response = await getAIService().ask(prompt);
    return { ok: true, response };
  } catch (error) {
    logUnexpectedAIError('request', error);
    return { ok: false, message: getAIServiceErrorMessage(error) };
  }
};

const handleListAIModels = async (
  event: IpcMainInvokeEvent,
): Promise<AIModelListResult> => {
  if (!isPreferencesRenderer(event.sender)) {
    throw new Error('AI models are unavailable to this window.');
  }

  try {
    const models = await getAIService().listModels();
    return { ok: true, models };
  } catch (error) {
    logUnexpectedAIError('model_list', error);
    return { ok: false, message: getAIServiceErrorMessage(error) };
  }
};

const handleTestAIConnection = async (
  event: IpcMainInvokeEvent,
): Promise<AIConnectionTestResult> => {
  if (!isPreferencesRenderer(event.sender)) {
    throw new Error('AI connection testing is unavailable to this window.');
  }

  try {
    const result = await getAIService().testConnection();
    return { ok: true, ...result };
  } catch (error) {
    logUnexpectedAIError('connection_test', error);
    return { ok: false, message: getAIServiceErrorMessage(error) };
  }
};

const registerIpcHandlers = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.getCursorPosition,
    handleGetCursorPosition,
  );
  ipcMain.handle(
    IPC_CHANNELS.getRuntimeSettings,
    handleGetRuntimeSettings,
  );
  ipcMain.handle(
    IPC_CHANNELS.getPreferencesSettings,
    handleGetPreferencesSettings,
  );
  ipcMain.handle(
    IPC_CHANNELS.updatePreferencesSettings,
    handleUpdatePreferencesSettings,
  );
  ipcMain.handle(
    IPC_CHANNELS.updateAiConfiguration,
    handleUpdateAiConfiguration,
  );
  ipcMain.handle(IPC_CHANNELS.askAI, handleAskAI);
  ipcMain.handle(IPC_CHANNELS.listAIModels, handleListAIModels);
  ipcMain.handle(
    IPC_CHANNELS.testAIConnection,
    handleTestAIConnection,
  );
  ipcMain.on(IPC_CHANNELS.moveWindow, handleMoveWindow);
  ipcMain.on(
    IPC_CHANNELS.showCompanionContextMenu,
    handleShowCompanionContextMenu,
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
  ipcMain.removeListener(IPC_CHANNELS.moveWindow, handleMoveWindow);
  ipcMain.removeListener(
    IPC_CHANNELS.showCompanionContextMenu,
    handleShowCompanionContextMenu,
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

  try {
    await synchronizeAISettings(settingsService.get());
  } catch (error) {
    console.error('[ai] configuration_failed', error);
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
  unsubscribeFromSettings?.();
  unsubscribeFromSettings = null;
  const activeAIService = aiService;
  aiService = null;
  void activeAIService?.dispose().catch((error: unknown) => {
    console.error('[ai] dispose_failed', error);
  });
  unregisterIpcHandlers();
  tray?.destroy();
  tray = null;
});
