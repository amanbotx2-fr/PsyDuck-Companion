import { useEffect, useRef, useState } from 'react';

import {
  createDefaultRuntimeSettings,
  type RuntimeSettings,
} from '../../shared/settings';

export function useRuntimeSettings(): RuntimeSettings {
  const [settings, setSettings] = useState(createDefaultRuntimeSettings);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const companionBridge = window.psyduck;

    if (companionBridge === undefined) {
      return () => {
        mountedRef.current = false;
      };
    }

    const unsubscribe = companionBridge.onRuntimeSettingsChanged(
      (nextSettings) => {
        if (mountedRef.current) {
          setSettings(nextSettings);
        }
      },
    );

    void companionBridge
      .getRuntimeSettings()
      .then((nextSettings) => {
        if (mountedRef.current) {
          setSettings(nextSettings);
        }
      })
      .catch(() => {
        // Runtime defaults remain active if settings are unavailable.
      });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  return settings;
}
