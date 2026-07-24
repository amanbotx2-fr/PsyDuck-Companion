import { contextBridge, ipcRenderer } from 'electron';

import type {
  AiConfigurationUpdate,
  PreferencesSettings,
  PreferencesSettingsPatch,
  RuntimeSettings,
} from '../shared/settings';
import type {
  AIConnectionTestResult,
  AIModelListResult,
  PreferencesBridge,
  RuntimeSettingsChangeListener,
} from '../shared/types';
import type {
  UpdateStatus,
  UpdateStatusListener,
} from '../shared/updates';

// Sandboxed preload scripts cannot require local CommonJS modules. Keep the
// runtime channel table self-contained; type-only imports above are erased.
const IPC_CHANNELS = {
  getPreferencesSettings: 'preferences-settings:get',
  updatePreferencesSettings: 'preferences-settings:update',
  updateAiConfiguration: 'preferences-ai:configure',
  runtimeSettingsChanged: 'runtime-settings:changed',
  listAIModels: 'ai:list-models',
  testAIConnection: 'ai:test-connection',
  getUpdateStatus: 'updates:status:get',
  checkForUpdates: 'updates:check',
  updateStatusChanged: 'updates:status-changed',
} as const;

const preferencesBridge: PreferencesBridge = Object.freeze({
  getPreferencesSettings: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.getPreferencesSettings,
    ) as Promise<PreferencesSettings>,
  updatePreferencesSettings: (patch: PreferencesSettingsPatch) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.updatePreferencesSettings,
      patch,
    ) as Promise<PreferencesSettings>,
  updateAiConfiguration: (configuration: AiConfigurationUpdate) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.updateAiConfiguration,
      configuration,
    ) as Promise<PreferencesSettings>,
  listAIModels: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.listAIModels,
    ) as Promise<AIModelListResult>,
  testAIConnection: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.testAIConnection,
    ) as Promise<AIConnectionTestResult>,
  getUpdateStatus: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.getUpdateStatus,
    ) as Promise<UpdateStatus>,
  checkForUpdates: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.checkForUpdates,
    ) as Promise<UpdateStatus>,
  onUpdateStatusChanged: (listener: UpdateStatusListener) => {
    const handleUpdateStatusChanged = (
      _event: Electron.IpcRendererEvent,
      status: UpdateStatus,
    ): void => {
      listener(status);
    };

    ipcRenderer.on(
      IPC_CHANNELS.updateStatusChanged,
      handleUpdateStatusChanged,
    );

    return () => {
      ipcRenderer.removeListener(
        IPC_CHANNELS.updateStatusChanged,
        handleUpdateStatusChanged,
      );
    };
  },
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

contextBridge.exposeInMainWorld('psyduckPreferences', preferencesBridge);
