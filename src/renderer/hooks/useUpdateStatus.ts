import { useCallback, useEffect, useRef, useState } from 'react';

import type { UpdateStatus } from '../../shared/updates';

export interface UpdateStatusController {
  readonly updateStatus: UpdateStatus | null;
  readonly checkForUpdates: () => Promise<void>;
}

export function useUpdateStatus(): UpdateStatusController {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(
    null,
  );
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const preferencesBridge = window.psyduckPreferences;

    if (preferencesBridge === undefined) {
      setUpdateStatus({
        phase: 'error',
        currentVersion: 'Unknown',
        message: 'Update controls are unavailable in this window.',
      });

      return () => {
        mountedRef.current = false;
      };
    }

    const unsubscribe = preferencesBridge.onUpdateStatusChanged(
      (nextStatus) => {
        if (mountedRef.current) {
          setUpdateStatus(nextStatus);
        }
      },
    );

    void preferencesBridge
      .getUpdateStatus()
      .then((nextStatus) => {
        if (mountedRef.current) {
          setUpdateStatus(nextStatus);
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          setUpdateStatus({
            phase: 'error',
            currentVersion: 'Unknown',
            message: 'Update status could not be loaded.',
          });
        }
      });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  const checkForUpdates = useCallback(async (): Promise<void> => {
    const preferencesBridge = window.psyduckPreferences;

    if (preferencesBridge === undefined) {
      setUpdateStatus({
        phase: 'error',
        currentVersion: updateStatus?.currentVersion ?? 'Unknown',
        message: 'Update controls are unavailable in this window.',
      });
      return;
    }

    try {
      const nextStatus = await preferencesBridge.checkForUpdates();

      if (mountedRef.current) {
        setUpdateStatus(nextStatus);
      }
    } catch {
      if (mountedRef.current) {
        setUpdateStatus({
          phase: 'error',
          currentVersion: updateStatus?.currentVersion ?? 'Unknown',
          message: 'Unable to check for updates.',
        });
      }
    }
  }, [updateStatus?.currentVersion]);

  return {
    updateStatus,
    checkForUpdates,
  };
}
