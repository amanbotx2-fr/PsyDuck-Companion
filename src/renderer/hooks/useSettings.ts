import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createDefaultSettings,
  mergeSettings,
  type AppSettings,
  type SettingsPatch,
} from '../../shared/settings';

export type SettingsStatus =
  | 'loading'
  | 'ready'
  | 'saving'
  | 'saved'
  | 'error';

export interface SettingsController {
  readonly settings: AppSettings;
  readonly status: SettingsStatus;
  readonly errorMessage: string | null;
  readonly update: (patch: SettingsPatch) => Promise<void>;
}

export function useSettings(): SettingsController {
  const [settings, setSettings] = useState(createDefaultSettings);
  const [status, setStatus] = useState<SettingsStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const updateRevisionRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    const desktopBridge = window.psyduck;

    if (desktopBridge === undefined) {
      setStatus('error');
      setErrorMessage('Settings are unavailable in this window.');
      return () => {
        mountedRef.current = false;
      };
    }

    const unsubscribe = desktopBridge.onSettingsChanged(
      (nextSettings) => {
        if (!mountedRef.current) {
          return;
        }

        setSettings(nextSettings);
        setStatus('saved');
        setErrorMessage(null);
      },
    );

    void desktopBridge
      .getSettings()
      .then((nextSettings) => {
        if (!mountedRef.current) {
          return;
        }

        setSettings(nextSettings);
        setStatus('ready');
        setErrorMessage(null);
      })
      .catch(() => {
        if (!mountedRef.current) {
          return;
        }

        setStatus('error');
        setErrorMessage('Settings could not be loaded.');
      });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  const update = useCallback(async (patch: SettingsPatch): Promise<void> => {
    const desktopBridge = window.psyduck;

    if (desktopBridge === undefined) {
      setStatus('error');
      setErrorMessage('Settings are unavailable in this window.');
      return;
    }

    const revision = updateRevisionRef.current + 1;
    updateRevisionRef.current = revision;
    setSettings((currentSettings) =>
      mergeSettings(currentSettings, patch),
    );
    setStatus('saving');
    setErrorMessage(null);

    try {
      const savedSettings = await desktopBridge.updateSettings(patch);

      if (
        mountedRef.current &&
        revision === updateRevisionRef.current
      ) {
        setSettings(savedSettings);
        setStatus('saved');
      }
    } catch {
      if (!mountedRef.current) {
        return;
      }

      setStatus('error');
      setErrorMessage('Your change could not be saved. Try again.');

      try {
        const authoritativeSettings =
          await desktopBridge.getSettings();

        if (
          mountedRef.current &&
          revision === updateRevisionRef.current
        ) {
          setSettings(authoritativeSettings);
        }
      } catch {
        // The actionable save error remains visible.
      }
    }
  }, []);

  return {
    settings,
    status,
    errorMessage,
    update,
  };
}
