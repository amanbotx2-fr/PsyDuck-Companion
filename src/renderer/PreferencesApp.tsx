import type { ChangeEvent, ReactNode } from 'react';

import {
  isWaterReminderInterval,
  WATER_REMINDER_INTERVAL_OPTIONS,
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

export function PreferencesApp() {
  const { settings, status, errorMessage, update } = useSettings();
  const settingsAreLoading = status === 'loading';
  const statusLabel =
    status === 'loading'
      ? 'Loading'
      : status === 'saving'
        ? 'Saving…'
        : status === 'error'
          ? 'Not saved'
          : 'Saved';

  const save = (patch: SettingsPatch): void => {
    void update(patch);
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
          data-status={status}
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
          <div className="preferences-section__title-line">
            <h2 id="ai-title">AI</h2>
            <span className="placeholder-badge">Placeholder</span>
          </div>
          <p>Integration controls are not available yet</p>
        </div>

        <PreferenceRow
          htmlFor="ai-provider"
          label="Provider"
          description="Provider selection will be enabled with integrations."
          control={
            <select
              className="settings-select"
              id="ai-provider"
              value=""
              disabled
              onChange={() => undefined}
            >
              <option value="">No provider configured</option>
            </select>
          }
        />

        <PreferenceRow
          htmlFor="ai-api-key"
          label="API key"
          description="Credentials cannot be entered in this milestone."
          control={
            <input
              className="settings-input"
              id="ai-api-key"
              type="password"
              value=""
              placeholder="Not available"
              disabled
              readOnly
            />
          }
        />
      </section>

      <footer className="preferences-footer">
        Changes save automatically and apply to the companion immediately.
      </footer>
    </main>
  );
}
