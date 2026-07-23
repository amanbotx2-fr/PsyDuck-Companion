import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createSnoozedReminderInput,
  type ReminderFiredNotification,
} from '../../shared/reminders';

const SNOOZE_ERROR_MESSAGE = 'Could not snooze. Try again.';

interface ReminderNotificationError {
  readonly reminderId: string;
  readonly message: string;
}

export interface ReminderNotifications {
  readonly current: ReminderFiredNotification | null;
  readonly dismissCurrent: () => void;
  readonly errorMessage: string | null;
  readonly snoozeCurrent: () => Promise<void>;
  readonly snoozing: boolean;
}

export function useReminderNotifications(): ReminderNotifications {
  const snoozeInProgressRef = useRef<string | null>(null);
  const [notifications, setNotifications] = useState<
    readonly ReminderFiredNotification[]
  >([]);
  const [snoozingReminderId, setSnoozingReminderId] = useState<
    string | null
  >(null);
  const [error, setError] =
    useState<ReminderNotificationError | null>(null);
  const current = notifications[0] ?? null;
  const currentReminderId = current?.reminder.id ?? null;

  useEffect(() => {
    const bridge = window.psyduck;

    if (bridge === undefined) {
      return;
    }

    return bridge.onReminderFired((notification) => {
      setNotifications((existingNotifications) => {
        if (
          existingNotifications.some(
            ({ reminder }) =>
              reminder.id === notification.reminder.id,
          )
        ) {
          return existingNotifications;
        }

        return [...existingNotifications, notification];
      });
    });
  }, []);

  const dismissCurrent = useCallback((): void => {
    if (
      currentReminderId === null ||
      snoozeInProgressRef.current === currentReminderId
    ) {
      return;
    }

    setNotifications((existingNotifications) =>
      existingNotifications.filter(
        ({ reminder }) => reminder.id !== currentReminderId,
      ),
    );
    setError((currentError) =>
      currentError?.reminderId === currentReminderId
        ? null
        : currentError,
    );
  }, [currentReminderId]);

  const snoozeCurrent = useCallback(async (): Promise<void> => {
    if (
      current === null ||
      snoozeInProgressRef.current !== null
    ) {
      return;
    }

    const bridge = window.psyduck;
    const reminderId = current.reminder.id;

    if (bridge === undefined) {
      setError({
        reminderId,
        message: SNOOZE_ERROR_MESSAGE,
      });
      return;
    }

    snoozeInProgressRef.current = reminderId;
    setSnoozingReminderId(reminderId);
    setError(null);

    try {
      await bridge.createReminder(
        createSnoozedReminderInput(current.reminder),
      );
      setNotifications((existingNotifications) =>
        existingNotifications.filter(
          ({ reminder }) => reminder.id !== reminderId,
        ),
      );
    } catch {
      setError({
        reminderId,
        message: SNOOZE_ERROR_MESSAGE,
      });
    } finally {
      if (snoozeInProgressRef.current === reminderId) {
        snoozeInProgressRef.current = null;
      }

      setSnoozingReminderId((activeReminderId) =>
        activeReminderId === reminderId ? null : activeReminderId,
      );
    }
  }, [current]);

  return {
    current,
    dismissCurrent,
    errorMessage:
      error?.reminderId === currentReminderId
        ? error.message
        : null,
    snoozeCurrent,
    snoozing:
      currentReminderId !== null &&
      snoozingReminderId === currentReminderId,
  };
}
