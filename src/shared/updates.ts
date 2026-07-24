export type UpdateStatus =
  | {
      readonly phase: 'idle';
      readonly currentVersion: string;
    }
  | {
      readonly phase: 'checking';
      readonly currentVersion: string;
    }
  | {
      readonly phase: 'available';
      readonly currentVersion: string;
      readonly availableVersion: string;
    }
  | {
      readonly phase: 'not-available';
      readonly currentVersion: string;
    }
  | {
      readonly phase: 'downloading';
      readonly currentVersion: string;
      readonly availableVersion: string | null;
      readonly percent: number;
      readonly transferredBytes: number;
      readonly totalBytes: number;
      readonly bytesPerSecond: number;
    }
  | {
      readonly phase: 'downloaded';
      readonly currentVersion: string;
      readonly availableVersion: string;
    }
  | {
      readonly phase: 'error';
      readonly currentVersion: string;
      readonly message: string;
    };

export type UpdateStatusListener = (status: UpdateStatus) => void;

export const cloneUpdateStatus = (
  status: UpdateStatus,
): UpdateStatus => ({ ...status });
