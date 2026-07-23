import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  clonePomodoroState,
  createIdlePomodoroState,
  isPomodoroDuration,
  MAXIMUM_POMODORO_DURATION_MINUTES,
  MINIMUM_POMODORO_DURATION_MINUTES,
  type PomodoroCompletionListener,
  type PomodoroState,
  type PomodoroStateListener,
} from '../shared/pomodoro';

const POMODORO_DOCUMENT_VERSION = 1;
const SECOND_MS = 1_000;
const INVALID_DURATION_MESSAGE =
  `Pomodoro duration must be between ` +
  `${MINIMUM_POMODORO_DURATION_MINUTES} and ` +
  `${MAXIMUM_POMODORO_DURATION_MINUTES} minutes.`;

export interface PersistedPomodoroDocument {
  readonly version: typeof POMODORO_DOCUMENT_VERSION;
  readonly state: PomodoroState;
}

export interface PomodoroPersistence {
  load(): Promise<unknown | null>;
  save(document: PersistedPomodoroDocument): Promise<void>;
}

export interface PomodoroScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface PomodoroManagerOptions {
  readonly persistence: PomodoroPersistence;
  readonly now?: () => number;
  readonly scheduler?: PomodoroScheduler;
  readonly logError?: (event: string, error?: unknown) => void;
}

const DEFAULT_SCHEDULER: PomodoroScheduler = {
  setTimeout: (callback, delayMs) =>
    globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(
      handle as ReturnType<typeof globalThis.setTimeout>,
    );
  },
};

const isFileNotFoundError = (error: unknown): boolean =>
  error instanceof Error &&
  'code' in error &&
  (error as Error & { readonly code?: string }).code === 'ENOENT';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parsePersistedDocument = (
  value: unknown,
): PersistedPomodoroDocument | null => {
  if (
    !isRecord(value) ||
    value.version !== POMODORO_DOCUMENT_VERSION ||
    !isRecord(value.state)
  ) {
    return null;
  }

  const {
    running,
    paused,
    selectedDurationMinutes,
    durationMinutes,
    remainingSeconds,
    startedAt,
  } = value.state;

  if (
    typeof running !== 'boolean' ||
    typeof paused !== 'boolean' ||
    !isPomodoroDuration(selectedDurationMinutes) ||
    !isPomodoroDuration(durationMinutes) ||
    typeof remainingSeconds !== 'number' ||
    !Number.isInteger(remainingSeconds) ||
    remainingSeconds < 0 ||
    remainingSeconds > durationMinutes * 60 ||
    (startedAt !== null &&
      (typeof startedAt !== 'number' ||
        !Number.isSafeInteger(startedAt) ||
        startedAt < 0))
  ) {
    return null;
  }

  if (
    (!running &&
      (paused || remainingSeconds !== 0 || startedAt !== null)) ||
    (running && remainingSeconds === 0) ||
    (paused && !running) ||
    (running && !paused && startedAt === null)
  ) {
    return null;
  }

  return {
    version: POMODORO_DOCUMENT_VERSION,
    state: {
      running,
      paused,
      selectedDurationMinutes,
      durationMinutes,
      remainingSeconds,
      startedAt,
    },
  };
};

export class FilePomodoroPersistence implements PomodoroPersistence {
  public constructor(private readonly filePath: string) {}

  public async load(): Promise<unknown | null> {
    try {
      const serializedDocument = await readFile(this.filePath, 'utf8');
      return JSON.parse(serializedDocument) as unknown;
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  public async save(document: PersistedPomodoroDocument): Promise<void> {
    const temporaryPath = `${this.filePath}.tmp`;
    const serializedDocument = `${JSON.stringify(document, null, 2)}\n`;

    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(temporaryPath, serializedDocument, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporaryPath, this.filePath);
  }
}

export class PomodoroManager {
  private readonly persistence: PomodoroPersistence;
  private readonly now: () => number;
  private readonly scheduler: PomodoroScheduler;
  private readonly logError: (event: string, error?: unknown) => void;
  private readonly stateListeners = new Set<PomodoroStateListener>();
  private readonly completionListeners =
    new Set<PomodoroCompletionListener>();
  private state = createIdlePomodoroState();
  private tickTimer: unknown | null = null;
  private persistenceQueue: Promise<void> = Promise.resolve();
  private loaded = false;
  private disposed = false;

  public constructor(options: PomodoroManagerOptions) {
    this.persistence = options.persistence;
    this.now = options.now ?? Date.now;
    this.scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
    this.logError =
      options.logError ??
      ((event, error) => {
        console.error(`[pomodoro] ${event}`, {
          name: error instanceof Error ? error.name : 'UnknownError',
        });
      });
  }

  public async load(): Promise<PomodoroState> {
    if (this.loaded) {
      return this.getState();
    }

    this.assertNotDisposed();

    try {
      const storedValue = await this.persistence.load();

      if (storedValue === null) {
        this.state = createIdlePomodoroState();
        this.queuePersistence();
      } else {
        const document = parsePersistedDocument(storedValue);

        if (document === null) {
          this.logError('invalid_persisted_state');
          this.state = createIdlePomodoroState();
        } else {
          this.state = clonePomodoroState(document.state);
        }
      }
    } catch (error) {
      this.logError('load_failed', error);
      this.state = createIdlePomodoroState();
    }

    this.loaded = true;
    const snapshot = this.materializeState();

    if (snapshot.running && snapshot.remainingSeconds === 0) {
      this.completeSession();
    } else {
      this.notifyStateListeners(snapshot);
      this.scheduleTick();
    }

    await this.flushPersistence();
    return this.getState();
  }

  public getState(): PomodoroState {
    this.assertReady();
    const snapshot = this.materializeState();

    if (snapshot.running && snapshot.remainingSeconds === 0) {
      this.completeSession();
      return clonePomodoroState(this.state);
    }

    return clonePomodoroState(snapshot);
  }

  public start(durationMinutes = this.state.selectedDurationMinutes): void {
    this.assertReady();

    if (!isPomodoroDuration(durationMinutes)) {
      throw new RangeError(INVALID_DURATION_MESSAGE);
    }

    this.clearTick();
    this.state = {
      running: true,
      paused: false,
      selectedDurationMinutes: durationMinutes,
      durationMinutes,
      remainingSeconds: durationMinutes * 60,
      startedAt: this.now(),
    };
    this.queuePersistence();
    this.notifyStateListeners(this.state);
    this.scheduleTick();
  }

  public pause(): void {
    this.assertReady();

    if (!this.state.running || this.state.paused) {
      return;
    }

    const snapshot = this.materializeState();

    if (snapshot.remainingSeconds === 0) {
      this.completeSession();
      return;
    }

    this.clearTick();
    this.state = {
      ...snapshot,
      paused: true,
    };
    this.queuePersistence();
    this.notifyStateListeners(this.state);
  }

  public resume(): void {
    this.assertReady();

    if (!this.state.running || !this.state.paused) {
      return;
    }

    this.state = {
      ...this.state,
      paused: false,
      startedAt: this.now(),
    };
    this.queuePersistence();
    this.notifyStateListeners(this.state);
    this.scheduleTick();
  }

  public stop(): void {
    this.assertReady();

    if (!this.state.running) {
      return;
    }

    this.clearTick();
    this.state = createIdlePomodoroState(
      this.state.selectedDurationMinutes,
    );
    this.queuePersistence();
    this.notifyStateListeners(this.state);
  }

  public setDuration(durationMinutes: number): void {
    this.assertReady();

    if (!isPomodoroDuration(durationMinutes)) {
      throw new RangeError(INVALID_DURATION_MESSAGE);
    }

    const currentState = this.getState();

    if (durationMinutes === currentState.selectedDurationMinutes) {
      return;
    }

    this.state = currentState.running
      ? {
          ...this.state,
          selectedDurationMinutes: durationMinutes,
        }
      : {
          ...currentState,
          selectedDurationMinutes: durationMinutes,
          durationMinutes,
        };
    this.queuePersistence();
    this.notifyStateListeners(this.materializeState());
  }

  public subscribe(listener: PomodoroStateListener): () => void {
    this.stateListeners.add(listener);

    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public onComplete(listener: PomodoroCompletionListener): () => void {
    this.completionListeners.add(listener);

    return () => {
      this.completionListeners.delete(listener);
    };
  }

  public flushPersistence(): Promise<void> {
    return this.persistenceQueue;
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.clearTick();
    this.disposed = true;
    this.stateListeners.clear();
    this.completionListeners.clear();
  }

  private materializeState(): PomodoroState {
    if (
      !this.state.running ||
      this.state.paused ||
      this.state.startedAt === null
    ) {
      return clonePomodoroState(this.state);
    }

    const elapsedSeconds = Math.floor(
      Math.max(0, this.now() - this.state.startedAt) / SECOND_MS,
    );

    return {
      ...this.state,
      remainingSeconds: Math.max(
        0,
        this.state.remainingSeconds - elapsedSeconds,
      ),
    };
  }

  private scheduleTick(): void {
    this.clearTick();

    if (
      !this.state.running ||
      this.state.paused ||
      this.state.startedAt === null
    ) {
      return;
    }

    const elapsedMs = Math.max(0, this.now() - this.state.startedAt);
    const elapsedRemainder = elapsedMs % SECOND_MS;
    const delayMs =
      elapsedRemainder === 0
        ? SECOND_MS
        : SECOND_MS - elapsedRemainder;

    this.tickTimer = this.scheduler.setTimeout(() => {
      this.tickTimer = null;
      const snapshot = this.materializeState();

      if (snapshot.remainingSeconds === 0) {
        this.completeSession();
        return;
      }

      this.notifyStateListeners(snapshot);
      this.scheduleTick();
    }, delayMs);
  }

  private completeSession(): void {
    if (!this.state.running) {
      return;
    }

    this.clearTick();
    this.state = createIdlePomodoroState(
      this.state.selectedDurationMinutes,
    );
    this.queuePersistence();
    this.notifyStateListeners(this.state);

    for (const listener of this.completionListeners) {
      try {
        listener();
      } catch (error) {
        this.logError('completion_listener_failed', error);
      }
    }
  }

  private clearTick(): void {
    if (this.tickTimer === null) {
      return;
    }

    this.scheduler.clearTimeout(this.tickTimer);
    this.tickTimer = null;
  }

  private queuePersistence(): void {
    const document: PersistedPomodoroDocument = {
      version: POMODORO_DOCUMENT_VERSION,
      state: clonePomodoroState(this.state),
    };
    const save = (): Promise<void> => this.persistence.save(document);
    const saveOperation = this.persistenceQueue.then(save, save);

    this.persistenceQueue = saveOperation.catch((error: unknown) => {
      this.logError('save_failed', error);
    });
  }

  private notifyStateListeners(state: PomodoroState): void {
    const snapshot = clonePomodoroState(state);

    for (const listener of this.stateListeners) {
      try {
        listener(clonePomodoroState(snapshot));
      } catch (error) {
        this.logError('state_listener_failed', error);
      }
    }
  }

  private assertReady(): void {
    this.assertNotDisposed();

    if (!this.loaded) {
      throw new Error('PomodoroManager has not been loaded.');
    }
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error('PomodoroManager has been disposed.');
    }
  }
}
