import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';

import {
  AI_PROVIDER_OPTIONS,
  getDefaultAiModel,
  isAiProvider,
  isValidAiEndpoint,
  isWaterReminderInterval,
  WATER_REMINDER_INTERVAL_OPTIONS,
  type AiSettings,
  type SettingsPatch,
} from '../shared/settings';
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
  | { readonly phase: 'success'; readonly message: string }
  | { readonly phase: 'error'; readonly message: string };

const INITIAL_CONNECTION_STATUS: ConnectionStatus = { phase: 'idle' };

export function PreferencesApp() {
  const { settings, status, errorMessage, update } = useSettings();
  const [aiDraft, setAiDraft] = useState<AiSettings>(settings.ai);
  const [aiDirty, setAiDirty] = useState(false);
  const [availableModels, setAvailableModels] = useState<
    readonly { readonly id: string; readonly displayName?: string }[]
  >([]);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>(INITIAL_CONNECTION_STATUS);
  const settingsAreLoading = status === 'loading';
  const aiActionInProgress =
    connectionStatus.phase === 'testing' || status === 'saving';
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

    setAiDraft(settings.ai);
  }, [
    aiDirty,
    settings.ai.apiKey,
    settings.ai.enabled,
    settings.ai.endpoint,
    settings.ai.model,
    settings.ai.provider,
  ]);

  const modelOptions = useMemo(() => {
    const options = new Map<string, string>();

    for (const model of availableModels) {
      options.set(model.id, model.displayName ?? model.id);
    }

    if (aiDraft.provider !== '') {
      const defaultModel = getDefaultAiModel(aiDraft.provider);

      if (defaultModel.length > 0) {
        options.set(defaultModel, defaultModel);
      }
    }

    return [...options.entries()].map(([id, label]) => ({ id, label }));
  }, [aiDraft.provider, availableModels]);

  const updateAiDraft = (patch: Partial<AiSettings>): void => {
    setAiDraft((currentDraft) => ({ ...currentDraft, ...patch }));
    setAiDirty(true);
    setConnectionStatus(INITIAL_CONNECTION_STATUS);
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
        message: 'Connection testing is unavailable in this window.',
      });
      return;
    }

    try {
      const result = await desktopBridge.testAIConnection();

      if (!result.ok) {
        setConnectionStatus({ phase: 'error', message: result.message });
        return;
      }

      setAvailableModels(result.models);

      if (
        aiDraft.provider === 'ollama' &&
        aiDraft.model.trim().length === 0 &&
        result.models[0] !== undefined
      ) {
        updateAiDraft({ model: result.models[0].id });
        setConnectionStatus({
          phase: 'success',
          message: `${result.message} Select Save to use ${result.models[0].id}.`,
        });
        return;
      }

      setConnectionStatus({ phase: 'success', message: result.message });
    } catch {
      setConnectionStatus({
        phase: 'error',
        message: 'The connection test could not be completed.',
      });
    }
  };

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
                updateAiDraft({ enabled });
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
                    model: getDefaultAiModel(provider),
                    apiKey: '',
                  });
                }

                setAvailableModels([]);
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

        <PreferenceRow
          htmlFor="ai-model"
          label="Model"
          description={
            aiDraft.provider === 'ollama'
              ? 'Test the endpoint to retrieve installed local models.'
              : 'Enter a model identifier available to this provider account.'
          }
          control={
            <>
              <input
                className="settings-input"
                id="ai-model"
                type="text"
                list="ai-model-options"
                value={aiDraft.model}
                placeholder={
                  aiDraft.provider === 'ollama'
                    ? 'Select an installed model'
                    : 'Model identifier'
                }
                disabled={
                  settingsAreLoading ||
                  aiActionInProgress ||
                  aiDraft.provider === ''
                }
                spellCheck={false}
                onChange={(event) => {
                  updateAiDraft({ model: event.currentTarget.value });
                }}
              />
              <datalist id="ai-model-options">
                {modelOptions.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </datalist>
            </>
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
            data-status={connectionStatus.phase}
            aria-live="polite"
            role={connectionStatus.phase === 'error' ? 'alert' : 'status'}
          >
            {connectionStatus.phase === 'idle'
              ? 'Connection tests do not send a chat prompt.'
              : connectionStatus.message}
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
        </div>
      </section>

      <footer className="preferences-footer">
        General and hydration changes save automatically. AI changes apply
        when saved.
      </footer>
    </main>
  );
}
