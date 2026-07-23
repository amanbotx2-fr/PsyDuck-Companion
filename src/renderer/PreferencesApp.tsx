import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';

import type { AIProviderHttpDiagnostics } from '../ai/AIProvider';
import {
  createModelReference,
  recordRecentModel,
  toggleFavoriteModel,
  type ModelExplorerSource,
} from '../shared/modelMetadata';
import {
  AI_PROVIDER_OPTIONS,
  isAiProvider,
  isValidAiEndpoint,
  isWaterReminderInterval,
  normalizeOpenAICompatibleBaseUrl,
  WATER_REMINDER_INTERVAL_OPTIONS,
  type AiConfigurationUpdate,
  type AiModelExplorerSettings,
  type PreferencesAiSettings,
  type PreferencesSettingsPatch,
} from '../shared/settings';
import { personalityService } from '../personality';
import { AIModelExplorer } from './components/AIModelExplorer';
import { usePreferencesSettings } from './hooks/usePreferencesSettings';

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
  | {
      readonly phase: 'error';
      readonly message: string;
      readonly diagnostics?: AIProviderHttpDiagnostics;
    };

type ModelLoadingStatus =
  | { readonly phase: 'idle' }
  | { readonly phase: 'loading' }
  | { readonly phase: 'loaded' }
  | { readonly phase: 'empty' }
  | { readonly phase: 'error'; readonly message: string };

const INITIAL_CONNECTION_STATUS: ConnectionStatus = { phase: 'idle' };
const INITIAL_MODEL_LOADING_STATUS: ModelLoadingStatus = { phase: 'idle' };

export function PreferencesApp() {
  const {
    settings,
    status,
    errorMessage,
    update,
    updateAiConfiguration,
  } = usePreferencesSettings();
  const [aiDraft, setAiDraft] =
    useState<PreferencesAiSettings>(settings.ai);
  const [aiDirty, setAiDirty] = useState(false);
  const [apiKeyEdited, setApiKeyEdited] = useState(false);
  const [apiKeyClearRequested, setApiKeyClearRequested] =
    useState(false);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const modelExplorerPreferencesRef = useRef<AiModelExplorerSettings>(
    settings.aiModelExplorer,
  );
  const [availableModels, setAvailableModels] = useState<
    readonly ModelExplorerSource[]
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

  const save = (patch: PreferencesSettingsPatch): void => {
    void update(patch);
  };

  useEffect(() => {
    modelExplorerPreferencesRef.current = settings.aiModelExplorer;
  }, [settings.aiModelExplorer]);

  useEffect(() => {
    if (aiDirty) {
      return;
    }

    if (
      settings.ai.enabled === aiDraft.enabled &&
      settings.ai.provider === aiDraft.provider &&
      settings.ai.model === aiDraft.model &&
      settings.ai.apiKeyConfigured === aiDraft.apiKeyConfigured &&
      settings.ai.endpoint === aiDraft.endpoint &&
      settings.ai.baseUrl === aiDraft.baseUrl
    ) {
      return;
    }

    setAiDraft(settings.ai);
    setApiKeyEdited(false);
    setApiKeyClearRequested(false);

    if (apiKeyInputRef.current !== null) {
      apiKeyInputRef.current.value = '';
    }

    setAvailableModels([]);
    setConnectionStatus(INITIAL_CONNECTION_STATUS);
    setModelLoadingStatus(INITIAL_MODEL_LOADING_STATUS);
  }, [
    aiDirty,
    settings.ai.apiKeyConfigured,
    settings.ai.baseUrl,
    settings.ai.enabled,
    settings.ai.endpoint,
    settings.ai.model,
    settings.ai.provider,
    aiDraft.apiKeyConfigured,
    aiDraft.baseUrl,
    aiDraft.enabled,
    aiDraft.endpoint,
    aiDraft.model,
    aiDraft.provider,
  ]);

  const invalidateAiConnection = (): void => {
    setAvailableModels([]);
    setConnectionStatus(INITIAL_CONNECTION_STATUS);
    setModelLoadingStatus(INITIAL_MODEL_LOADING_STATUS);
  };

  const updateAiDraft = (
    patch: Partial<PreferencesAiSettings>,
    invalidateConnection = true,
  ): void => {
    setAiDraft((currentDraft) => ({ ...currentDraft, ...patch }));
    setAiDirty(true);

    if (invalidateConnection) {
      invalidateAiConnection();
    }
  };

  const persistModelExplorerPreferences = (
    nextPreferences: AiModelExplorerSettings,
  ): void => {
    modelExplorerPreferencesRef.current = nextPreferences;
    save({ aiModelExplorer: nextPreferences });
  };

  const handleToggleFavoriteModel = (modelId: string): void => {
    if (aiDraft.provider === '') {
      return;
    }

    const reference = createModelReference(aiDraft.provider, modelId);
    persistModelExplorerPreferences(
      toggleFavoriteModel(
        modelExplorerPreferencesRef.current,
        reference,
      ),
    );
  };

  const handleSelectModel = (modelId: string): void => {
    if (aiDraft.provider === '') {
      return;
    }

    const reference = createModelReference(aiDraft.provider, modelId);
    updateAiDraft({ model: reference.modelId }, false);
    persistModelExplorerPreferences(
      recordRecentModel(
        modelExplorerPreferencesRef.current,
        reference,
      ),
    );
  };

  const handleApiKeyChange = (): void => {
    setApiKeyEdited(true);
    setApiKeyClearRequested(false);
    setAiDirty(true);
    invalidateAiConnection();
  };

  const clearApiKeyDraft = (): void => {
    if (apiKeyInputRef.current !== null) {
      apiKeyInputRef.current.value = '';
    }

    setApiKeyEdited(false);
    setApiKeyClearRequested(true);
    setAiDraft((currentDraft) => ({
      ...currentDraft,
      apiKeyConfigured: false,
    }));
    setAiDirty(true);
    invalidateAiConnection();
  };

  const saveAiSettings = async (): Promise<boolean> => {
    const customBaseUrl =
      aiDraft.provider === 'custom'
        ? normalizeOpenAICompatibleBaseUrl(aiDraft.baseUrl)
        : aiDraft.baseUrl.trim();
    const normalizedDraft: PreferencesAiSettings = {
      ...aiDraft,
      model: aiDraft.model.trim(),
      endpoint: aiDraft.endpoint.trim(),
      baseUrl: customBaseUrl ?? '',
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

    if (normalizedDraft.provider === 'custom' && customBaseUrl === null) {
      setConnectionStatus({
        phase: 'error',
        message:
          'Enter a valid HTTPS URL or a local/private-network HTTP URL.',
      });
      return false;
    }

    const apiKey = apiKeyClearRequested
      ? ''
      : apiKeyEdited
        ? (apiKeyInputRef.current?.value.trim() ?? '')
        : undefined;
    const configuration: AiConfigurationUpdate = {
      enabled: normalizedDraft.enabled,
      provider: normalizedDraft.provider,
      model: normalizedDraft.model,
      endpoint: normalizedDraft.endpoint,
      baseUrl: normalizedDraft.baseUrl,
      ...(apiKey === undefined ? {} : { apiKey }),
    };
    const didSave = await updateAiConfiguration(configuration);

    if (didSave) {
      setAiDraft({
        ...normalizedDraft,
        apiKeyConfigured:
          apiKey === undefined
            ? normalizedDraft.apiKeyConfigured
            : apiKey.length > 0,
      });
      setAiDirty(false);
      setApiKeyEdited(false);
      setApiKeyClearRequested(false);

      if (apiKeyInputRef.current !== null) {
        apiKeyInputRef.current.value = '';
      }
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

    const preferencesBridge = window.psyduckPreferences;

    if (preferencesBridge === undefined) {
      setConnectionStatus({
        phase: 'error',
        message: personalityService.getProviderFailedMessage(),
      });
      return;
    }

    try {
      const result = await preferencesBridge.testAIConnection();

      if (!result.ok) {
        setConnectionStatus({
          phase: 'error',
          message: result.message,
          ...(result.diagnostics === undefined
            ? {}
            : { diagnostics: result.diagnostics }),
        });
        return;
      }

      setAvailableModels([]);
      setModelLoadingStatus(INITIAL_MODEL_LOADING_STATUS);
      setConnectionStatus({
        phase: 'connected',
        message:
          aiDraft.provider === 'custom'
            ? result.message
            : personalityService.getProviderConnectedMessage(),
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

    const preferencesBridge = window.psyduckPreferences;

    if (preferencesBridge === undefined) {
      setModelLoadingStatus({
        phase: 'error',
        message: 'Model discovery is unavailable in this window.',
      });
      return;
    }

    setModelLoadingStatus({ phase: 'loading' });

    try {
      const result = await preferencesBridge.listAIModels();

      if (!result.ok) {
        setAvailableModels([]);
        setModelLoadingStatus({
          phase: 'error',
          message: result.message,
        });
        return;
      }

      console.info('[ai] model_selector_populated', {
        providerId: aiDraft.provider,
        displayedModelCount: result.models.length,
      });

      if (result.models.length === 0) {
        setAvailableModels([]);
        setModelLoadingStatus({ phase: 'empty' });

        if (aiDraft.provider !== 'custom') {
          updateAiDraft({ model: '' }, false);
        }

        return;
      }

      setAvailableModels(result.models);
      setModelLoadingStatus({ phase: 'loaded' });

      if (
        aiDraft.provider === 'custom'
          ? aiDraft.model.trim().length === 0
          : !result.models.some((model) => model.id === aiDraft.model)
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
        ? aiDraft.provider === 'custom'
          ? 'Models endpoint unavailable. Enter a model manually.'
          : 'No models available'
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
  const connectionDiagnostics =
    connectionStatus.phase === 'error'
      ? connectionStatus.diagnostics
      : undefined;
  const modelDiscoveryUnavailable =
    modelLoadingStatus.phase === 'empty' ||
    modelLoadingStatus.phase === 'error' ||
    connectionStatus.phase === 'error';

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

                if (apiKeyInputRef.current !== null) {
                  apiKeyInputRef.current.value = '';
                }

                setApiKeyEdited(false);
                setApiKeyClearRequested(
                  (currentRequest) =>
                    currentRequest || aiDraft.apiKeyConfigured,
                );

                if (provider === '') {
                  updateAiDraft({
                    provider: '',
                    model: '',
                    apiKeyConfigured: false,
                  });
                } else if (isAiProvider(provider)) {
                  updateAiDraft({
                    provider,
                    model: '',
                    apiKeyConfigured: false,
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

        {aiDraft.provider === 'custom' ? (
          <PreferenceRow
            htmlFor="ai-base-url"
            label="Base URL *"
            description="The API root, including its compatibility path when required."
            control={
              <input
                className="settings-input"
                id="ai-base-url"
                type="url"
                value={aiDraft.baseUrl}
                placeholder="https://example.com/v1"
                disabled={settingsAreLoading || aiActionInProgress}
                spellCheck={false}
                required
                onChange={(event) => {
                  updateAiDraft({ baseUrl: event.currentTarget.value });
                }}
              />
            }
          />
        ) : null}

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
            description={
              aiDraft.apiKeyConfigured
                ? 'A key is configured. Enter a new key to replace it.'
                : aiDraft.provider === 'custom'
                  ? 'Optional. Leave this empty for servers without authentication.'
                  : 'Enter a key to configure this provider.'
            }
            control={
              <div className="credential-control">
                <input
                  ref={apiKeyInputRef}
                  className="settings-input"
                  id="ai-api-key"
                  type="password"
                  defaultValue=""
                  placeholder={
                    aiDraft.apiKeyConfigured
                      ? 'Configured'
                      : 'Enter API key'
                  }
                  disabled={settingsAreLoading || aiActionInProgress}
                  autoComplete="new-password"
                  spellCheck={false}
                  onChange={handleApiKeyChange}
                />
                {aiDraft.apiKeyConfigured ? (
                  <button
                    className="settings-button settings-button--secondary credential-control__remove"
                    type="button"
                    disabled={settingsAreLoading || aiActionInProgress}
                    onClick={clearApiKeyDraft}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            }
          />
        )}

        <div
          className={`ai-settings-actions${
            connectionDiagnostics === undefined
              ? ''
              : ' ai-settings-actions--with-diagnostics'
          }`}
        >
          <div className="connection-feedback">
            <p
              className="connection-status"
              data-status={providerStatusTone}
              aria-live="polite"
              role={providerStatusTone === 'error' ? 'alert' : 'status'}
            >
              {providerStatusMessage}
            </p>
            {connectionDiagnostics === undefined ? null : (
              <section
                className="connection-diagnostics"
                aria-labelledby="connection-diagnostics-title"
              >
                <h3 id="connection-diagnostics-title">
                  Developer diagnostics
                </h3>
                <dl>
                  <div>
                    <dt>Request URL</dt>
                    <dd>
                      <code>{connectionDiagnostics.requestUrl}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>HTTP status</dt>
                    <dd>
                      {connectionDiagnostics.httpStatusCode === null
                        ? 'Not available'
                        : `${connectionDiagnostics.httpStatusCode}${
                            connectionDiagnostics.httpStatusText === null
                              ? ''
                              : ` ${connectionDiagnostics.httpStatusText}`
                          }`}
                    </dd>
                  </div>
                  <div>
                    <dt>Response body</dt>
                    <dd>
                      <pre>{connectionDiagnostics.responseBody}</pre>
                    </dd>
                  </div>
                  <div>
                    <dt>Error code</dt>
                    <dd>
                      <code>
                        {connectionDiagnostics.errorCode ?? 'Not provided'}
                      </code>
                    </dd>
                  </div>
                  <div>
                    <dt>Error message</dt>
                    <dd>{connectionDiagnostics.errorMessage}</dd>
                  </div>
                </dl>
              </section>
            )}
          </div>
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
          description="Browse discovered models or enter an ID when discovery is unavailable."
          control={
            aiDraft.provider !== '' &&
            modelLoadingStatus.phase === 'loaded' &&
            availableModels.length > 0 ? (
              <AIModelExplorer
                models={availableModels}
                provider={aiDraft.provider}
                selectedModelId={aiDraft.model}
                preferences={settings.aiModelExplorer}
                disabled={settingsAreLoading || aiActionInProgress}
                onSelect={handleSelectModel}
                onToggleFavorite={handleToggleFavoriteModel}
              />
            ) : aiDraft.provider === 'custom' ||
              modelDiscoveryUnavailable ? (
              <div className="model-manual-entry">
                {modelDiscoveryUnavailable ? (
                  <p id="ai-model-fallback-message">
                    Couldn&apos;t load models. Enter a model ID manually.
                  </p>
                ) : null}
                <input
                  className="settings-input settings-select--model"
                  id="ai-model"
                  type="text"
                  value={aiDraft.model}
                  placeholder="Enter model ID"
                  disabled={settingsAreLoading || aiActionInProgress}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby={
                    modelDiscoveryUnavailable
                      ? 'ai-model-fallback-message'
                      : undefined
                  }
                  onChange={(event) => {
                    updateAiDraft(
                      { model: event.currentTarget.value },
                      false,
                    );
                  }}
                />
              </div>
            ) : (
              <button
                className="model-explorer-trigger"
                id="ai-model"
                type="button"
                disabled={
                  settingsAreLoading ||
                  aiActionInProgress ||
                  aiDraft.provider === ''
                }
              >
                <span className="model-explorer-trigger__label">
                  {modelLoadingStatus.phase === 'loading'
                    ? 'Loading models…'
                    : aiDraft.provider === ''
                      ? 'Select a provider first'
                      : 'Load models first'}
                </span>
                <span className="model-explorer-trigger__action">
                  Browse models
                </span>
              </button>
            )
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
