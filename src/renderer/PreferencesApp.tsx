import {
  useEffect,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';

import {
  AI_PROVIDER_OPTIONS,
  isAiProvider,
  isValidAiEndpoint,
  isWaterReminderInterval,
  WATER_REMINDER_INTERVAL_OPTIONS,
  type AiSettings,
  type SettingsPatch,
} from '../shared/settings';
import { personalityService } from '../personality';
import { useSettings } from './hooks/useSettings';

interface PreferenceRowProps {
  readonly control: ReactNode;
  readonly description: string;
  readonly htmlFor: string;
  readonly label: string;
}

function PreferenceRow({
  control,
  description,
  htmlFor,
  label,
}: PreferenceRowProps) {
  return (
    <div className="preference-row">
      <div className="preference-row__copy">
        <label className="preference-row__label" htmlFor={htmlFor}>
          {label}
        </label>
        <p className="preference-row__description">{description}</p>
      </div>
      <div className="preference-row__control">{control}</div>
    </div>
  );
}

interface SettingsSwitchProps {
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly id: string;
  readonly label: string;
  readonly onChange: (checked: boolean) => void;
}

function SettingsSwitch({
  checked,
  disabled = false,
  id,
  label,
  onChange,
}: SettingsSwitchProps) {
  return (
    <input
      className="settings-switch"
      id={id}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={(event) => {
        onChange(event.currentTarget.checked);
      }}
    />
  );
}

type ConnectionStatus =
  | { readonly phase: 'idle' }
  | { readonly phase: 'testing'; readonly message: string }
  | { readonly phase: 'connected'; readonly message: string }
  | { readonly phase: 'error'; readonly message: string };

type ModelLoadingStatus =
  | { readonly phase: 'idle' }
  | { readonly phase: 'loading' }
  | { readonly phase: 'loaded' }
  | { readonly phase: 'empty' }
  | { readonly phase: 'error'; readonly message: string };

const INITIAL_CONNECTION_STATUS: ConnectionStatus = { phase: 'idle' };
const INITIAL_MODEL_LOADING_STATUS: ModelLoadingStatus = { phase: 'idle' };

export function PreferencesApp() {
  const { settings, status, errorMessage, update } = useSettings();
  const [aiDraft, setAiDraft] = useState<AiSettings>(settings.ai);
  const [aiDirty, setAiDirty] = useState(false);
  const [availableModels, setAvailableModels] = useState<
    readonly { readonly id: string; readonly displayName?: string }[]
  >([]);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>(INITIAL_CONNECTION_STATUS);
  const [modelLoadingStatus, setModelLoadingStatus] =
    useState<ModelLoadingStatus>(INITIAL_MODEL_LOADING_STATUS);
  const settingsAreLoading = status === 'loading';
  const aiActionInProgress =
    connectionStatus.phase === 'testing' ||
    modelLoadingStatus.phase === 'loading' ||
    status === 'saving';
  const displayedStatus =
    aiDirty && status !== 'loading' && status !== 'saving' && status !== 'error'
      ? 'dirty'
      : status;
  const statusLabel =
    displayedStatus === 'loading'
      ? 'Loading'
      : displayedStatus === 'saving'
        ? 'Saving…'
        : displayedStatus === 'error'
          ? 'Not saved'
          : displayedStatus === 'dirty'
            ? 'Unsaved'
            : 'Saved';

  const save = (patch: SettingsPatch): void => {
    void update(patch);
  };

  useEffect(() => {
    if (aiDirty) {
      return;
    }

    if (
      settings.ai.enabled === aiDraft.enabled &&
      settings.ai.provider === aiDraft.provider &&
      settings.ai.model === aiDraft.model &&
      settings.ai.apiKey === aiDraft.apiKey &&
      settings.ai.endpoint === aiDraft.endpoint
    ) {
      return;
    }

    setAiDraft(settings.ai);
    setAvailableModels([]);
    setConnectionStatus(INITIAL_CONNECTION_STATUS);
    setModelLoadingStatus(INITIAL_MODEL_LOADING_STATUS);
  }, [
    aiDirty,
    settings.ai.apiKey,
    settings.ai.enabled,
    settings.ai.endpoint,
    settings.ai.model,
    settings.ai.provider,
    aiDraft.apiKey,
    aiDraft.enabled,
    aiDraft.endpoint,
    aiDraft.model,
    aiDraft.provider,
  ]);

  const updateAiDraft = (
    patch: Partial<AiSettings>,
    invalidateConnection = true,
  ): void => {
    setAiDraft((currentDraft) => ({ ...currentDraft, ...patch }));
    setAiDirty(true);

    if (invalidateConnection) {
      setAvailableModels([]);
      setConnectionStatus(INITIAL_CONNECTION_STATUS);
      setModelLoadingStatus(INITIAL_MODEL_LOADING_STATUS);
    }
  };

  const saveAiSettings = async (): Promise<boolean> => {
    const normalizedDraft: AiSettings = {
      ...aiDraft,
      model: aiDraft.model.trim(),
      apiKey: aiDraft.apiKey.trim(),
      endpoint: aiDraft.endpoint.trim(),
    };

    if (
      normalizedDraft.provider === 'ollama' &&
      !isValidAiEndpoint(normalizedDraft.endpoint)
    ) {
      setConnectionStatus({
        phase: 'error',
        message: 'Enter a valid HTTP or HTTPS Ollama endpoint.',
      });
      return false;
    }

    const didSave = await update({ ai: normalizedDraft });

    if (didSave) {
      setAiDraft(normalizedDraft);
      setAiDirty(false);
    } else {
      setConnectionStatus({
        phase: 'error',
        message: 'The provider settings could not be saved.',
      });
    }

    return didSave;
  };

  const handleTestConnection = async (): Promise<void> => {
    setConnectionStatus({
      phase: 'testing',
      message: 'Testing connection…',
    });

    const didSave = aiDirty ? await saveAiSettings() : true;

    if (!didSave) {
      return;
    }

    const desktopBridge = window.psyduck;

    if (desktopBridge === undefined) {
      setConnectionStatus({
        phase: 'error',
        message: personalityService.getProviderFailedMessage(),
      });
      return;
    }

    try {
      const result = await desktopBridge.testAIConnection();

      if (!result.ok) {
        setConnectionStatus({
          phase: 'error',
          message: result.message,
        });
        return;
      }

      setAvailableModels([]);
      setModelLoadingStatus(INITIAL_MODEL_LOADING_STATUS);
      setConnectionStatus({
        phase: 'connected',
        message: personalityService.getProviderConnectedMessage(),
      });
    } catch {
      setConnectionStatus({
        phase: 'error',
        message: personalityService.getProviderFailedMessage(),
      });
    }
  };

  const handleLoadModels = async (): Promise<void> => {
    if (connectionStatus.phase !== 'connected') {
      return;
    }

    const desktopBridge = window.psyduck;

    if (desktopBridge === undefined) {
      setModelLoadingStatus({
        phase: 'error',
        message: 'Model discovery is unavailable in this window.',
      });
      return;
    }

    setModelLoadingStatus({ phase: 'loading' });

    try {
      const result = await desktopBridge.listAIModels();

      if (!result.ok) {
        setAvailableModels([]);
        setModelLoadingStatus({
          phase: 'error',
          message: result.message,
        });
        return;
      }

      if (result.models.length === 0) {
        setAvailableModels([]);
        setModelLoadingStatus({ phase: 'empty' });
        updateAiDraft({ model: '' }, false);
        return;
      }

      setAvailableModels(result.models);
      setModelLoadingStatus({ phase: 'loaded' });

      if (
        !result.models.some((model) => model.id === aiDraft.model)
      ) {
        updateAiDraft({ model: result.models[0]?.id ?? '' }, false);
      }
    } catch {
      setAvailableModels([]);
      setModelLoadingStatus({
        phase: 'error',
        message: 'Models could not be loaded.',
      });
    }
  };

  const providerStatusMessage =
    modelLoadingStatus.phase === 'loading'
      ? 'Loading models...'
      : modelLoadingStatus.phase === 'empty'
        ? 'No models available'
        : modelLoadingStatus.phase === 'error'
          ? modelLoadingStatus.message
          : connectionStatus.phase === 'idle'
            ? 'Test the connection before loading models.'
            : connectionStatus.message;
  const providerStatusTone =
    connectionStatus.phase === 'error' ||
    modelLoadingStatus.phase === 'error'
      ? 'error'
      : connectionStatus.phase === 'connected'
        ? 'success'
        : connectionStatus.phase;

  const handleWaterIntervalChange = (
    event: ChangeEvent<HTMLSelectElement>,
  ): void => {
    const interval = Number(event.currentTarget.value);

    if (isWaterReminderInterval(interval)) {
      save({ water: { interval } });
    }
  };

  return (
    <main className="preferences-page">
      <header className="preferences-header">
        <div>
          <p className="preferences-header__product">PsyDuck</p>
          <h1>Preferences</h1>
        </div>
        <p
          className="save-status"
          data-status={displayedStatus}
          aria-live="polite"
        >
          <span className="save-status__dot" aria-hidden="true" />
          {statusLabel}
        </p>
      </header>

      {errorMessage === null ? null : (
        <p className="preferences-error" role="alert">
          {errorMessage}
        </p>
      )}

      <section className="preferences-section" aria-labelledby="general-title">
        <div className="preferences-section__heading">
          <h2 id="general-title">General</h2>
          <p>Desktop behavior</p>
        </div>

        <PreferenceRow
          htmlFor="launch-at-startup"
          label="Launch at startup"
          description="Start PsyDuck when you sign in."
          control={
            <SettingsSwitch
              id="launch-at-startup"
              label="Launch at startup"
              checked={settings.general.launchAtStartup}
              disabled={settingsAreLoading}
              onChange={(launchAtStartup) => {
                save({ general: { launchAtStartup } });
              }}
            />
          }
        />

        <PreferenceRow
          htmlFor="always-on-top"
          label="Always on top"
          description="Keep PsyDuck above ordinary application windows."
          control={
            <SettingsSwitch
              id="always-on-top"
              label="Always on top"
              checked={settings.general.alwaysOnTop}
              disabled={settingsAreLoading}
              onChange={(alwaysOnTop) => {
                save({ general: { alwaysOnTop } });
              }}
            />
          }
        />

        <PreferenceRow
          htmlFor="eye-tracking"
          label="Eye tracking"
          description="Let PsyDuck follow the pointer with its pupils."
          control={
            <SettingsSwitch
              id="eye-tracking"
              label="Eye tracking"
              checked={settings.general.eyeTracking}
              disabled={settingsAreLoading}
              onChange={(eyeTracking) => {
                save({ general: { eyeTracking } });
              }}
            />
          }
        />
      </section>

      <section
        className="preferences-section"
        aria-labelledby="hydration-title"
      >
        <div className="preferences-section__heading">
          <h2 id="hydration-title">Hydration</h2>
          <p>Quiet reminders</p>
        </div>

        <PreferenceRow
          htmlFor="water-reminders"
          label="Enable reminders"
          description="Show a short hydration message at the selected interval."
          control={
            <SettingsSwitch
              id="water-reminders"
              label="Enable water reminders"
              checked={settings.water.enabled}
              disabled={settingsAreLoading}
              onChange={(enabled) => {
                save({ water: { enabled } });
              }}
            />
          }
        />

        <PreferenceRow
          htmlFor="water-interval"
          label="Reminder interval"
          description="The next reminder is scheduled from the latest change."
          control={
            <select
              className="settings-select"
              id="water-interval"
              value={settings.water.interval}
              disabled={settingsAreLoading || !settings.water.enabled}
              onChange={handleWaterIntervalChange}
            >
              {WATER_REMINDER_INTERVAL_OPTIONS.map((interval) => (
                <option key={interval} value={interval}>
                  {interval} minutes
                </option>
              ))}
            </select>
          }
        />
      </section>

      <section className="preferences-section" aria-labelledby="ai-title">
        <div className="preferences-section__heading">
          <h2 id="ai-title">AI</h2>
          <p>Inline responses</p>
        </div>

        <PreferenceRow
          htmlFor="ai-enabled"
          label="Enable AI"
          description="Allow click-to-chat requests through the selected provider."
          control={
            <SettingsSwitch
              id="ai-enabled"
              label="Enable AI"
              checked={aiDraft.enabled}
              disabled={settingsAreLoading || aiActionInProgress}
              onChange={(enabled) => {
                updateAiDraft({ enabled }, false);
              }}
            />
          }
        />

        <PreferenceRow
          htmlFor="ai-provider"
          label="Provider"
          description="Requests switch providers immediately after these settings are saved."
          control={
            <select
              className="settings-select"
              id="ai-provider"
              value={aiDraft.provider}
              disabled={settingsAreLoading || aiActionInProgress}
              onChange={(event) => {
                const provider = event.currentTarget.value;

                if (provider === '') {
                  updateAiDraft({
                    provider: '',
                    model: '',
                    apiKey: '',
                  });
                } else if (isAiProvider(provider)) {
                  updateAiDraft({
                    provider,
                    model: '',
                    apiKey: '',
                  });
                }
              }}
            >
              <option value="">Select a provider</option>
              {AI_PROVIDER_OPTIONS.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          }
        />

        {aiDraft.provider === 'ollama' ? (
          <PreferenceRow
            htmlFor="ai-endpoint"
            label="Endpoint"
            description="The HTTP or HTTPS address of the Ollama server."
            control={
              <input
                className="settings-input"
                id="ai-endpoint"
                type="url"
                value={aiDraft.endpoint}
                placeholder="http://localhost:11434"
                disabled={settingsAreLoading || aiActionInProgress}
                spellCheck={false}
                onChange={(event) => {
                  updateAiDraft({ endpoint: event.currentTarget.value });
                }}
              />
            }
          />
        ) : aiDraft.provider === '' ? null : (
          <PreferenceRow
            htmlFor="ai-api-key"
            label="API key"
            description="Stored locally in the application settings file."
            control={
              <input
                className="settings-input"
                id="ai-api-key"
                type="password"
                value={aiDraft.apiKey}
                placeholder="Enter API key"
                disabled={settingsAreLoading || aiActionInProgress}
                autoComplete="new-password"
                spellCheck={false}
                onChange={(event) => {
                  updateAiDraft({ apiKey: event.currentTarget.value });
                }}
              />
            }
          />
        )}

        <div className="ai-settings-actions">
          <p
            className="connection-status"
            data-status={providerStatusTone}
            aria-live="polite"
            role={providerStatusTone === 'error' ? 'alert' : 'status'}
          >
            {providerStatusMessage}
          </p>
          <div className="ai-settings-actions__buttons">
            <button
              className="settings-button settings-button--secondary"
              type="button"
              disabled={
                settingsAreLoading ||
                aiActionInProgress ||
                aiDraft.provider === ''
              }
              onClick={() => {
                void handleTestConnection();
              }}
            >
              {connectionStatus.phase === 'testing'
                ? 'Testing…'
                : 'Test Connection'}
            </button>
            <button
              className="settings-button settings-button--secondary"
              type="button"
              disabled={
                settingsAreLoading ||
                aiActionInProgress ||
                connectionStatus.phase !== 'connected'
              }
              onClick={() => {
                void handleLoadModels();
              }}
            >
              {modelLoadingStatus.phase === 'loading'
                ? 'Loading Models…'
                : 'Load Models'}
            </button>
          </div>
        </div>

        <PreferenceRow
          htmlFor="ai-model"
          label="Model"
          description="Models are loaded from the selected provider after a successful connection test."
          control={
            <select
              className="settings-select settings-select--model"
              id="ai-model"
              value={aiDraft.model}
              disabled={
                settingsAreLoading ||
                aiActionInProgress ||
                modelLoadingStatus.phase !== 'loaded' ||
                availableModels.length === 0
              }
              onChange={(event) => {
                updateAiDraft({ model: event.currentTarget.value }, false);
              }}
            >
              {modelLoadingStatus.phase === 'loading' ? (
                <option value="">Loading models...</option>
              ) : modelLoadingStatus.phase === 'empty' ? (
                <option value="">No models available</option>
              ) : modelLoadingStatus.phase === 'loaded' ? null : (
                <option value="">Load models first</option>
              )}
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.displayName ?? model.id}
                </option>
              ))}
            </select>
          }
        />

        <div className="ai-save-actions">
          <p>Save applies the selected provider and model immediately.</p>
          <button
            className="settings-button settings-button--primary"
            type="button"
            disabled={
              settingsAreLoading || aiActionInProgress || !aiDirty
            }
            onClick={() => {
              void saveAiSettings();
            }}
          >
            Save
          </button>
        </div>
      </section>

      <footer className="preferences-footer">
        General and hydration changes save automatically. AI changes apply
        when saved.
      </footer>
    </main>
  );
}
