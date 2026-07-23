import {
  PERSONALITY_MESSAGE_CATALOGS,
  type PersonalityId,
  type PersonalityMessageCategory,
  type PersonalityMessages,
} from './messages';
import {
  PERSONALITY_EVENT_TYPE,
  PERSONALITY_TRIGGERS,
  PERSONALITY_TRIGGER_MESSAGE_CATEGORIES,
  type PersonalityEventListener,
  type PersonalitySpeechEvent,
  type PersonalityTrigger,
} from './PersonalityEvents';

export interface PersonalityServiceOptions {
  readonly personality?: PersonalityId;
  readonly random?: () => number;
  readonly catalogs?: Readonly<Record<string, PersonalityMessages>>;
  readonly onListenerError?: (
    error: unknown,
    event: PersonalitySpeechEvent,
  ) => void;
}

const MAXIMUM_SOURCE_EVENT_ID_LENGTH = 128;

const normalizeRandomValue = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), 1 - Number.EPSILON);
};

export class PersonalityService {
  private readonly catalogs: Readonly<Record<string, PersonalityMessages>>;
  private readonly random: () => number;
  private readonly previousSelections = new Map<
    PersonalityMessageCategory,
    number
  >();
  private readonly listeners = new Set<PersonalityEventListener>();
  private readonly processedSourceEvents = new Set<string>();
  private readonly onListenerError:
    | ((
        error: unknown,
        event: PersonalitySpeechEvent,
      ) => void)
    | undefined;
  private personality: PersonalityId;
  private nextEventId = 1;

  public constructor(options: PersonalityServiceOptions = {}) {
    this.catalogs = options.catalogs ?? PERSONALITY_MESSAGE_CATALOGS;
    this.random = options.random ?? Math.random;
    this.personality = options.personality ?? 'default';
    this.onListenerError = options.onListenerError;
    this.requireCatalog(this.personality);
  }

  public get activePersonality(): PersonalityId {
    return this.personality;
  }

  public setPersonality(personality: PersonalityId): void {
    if (personality === this.personality) {
      return;
    }

    this.requireCatalog(personality);
    this.personality = personality;
    this.previousSelections.clear();
  }

  public getMessage(category: PersonalityMessageCategory): string {
    const messages = this.requireCatalog(this.personality)[category];
    const previousIndex = this.previousSelections.get(category);
    const randomValue = this.readRandomValue();
    let messageIndex: number;

    if (messages.length === 1 || previousIndex === undefined) {
      messageIndex = Math.floor(randomValue * messages.length);
    } else {
      const alternativeIndex = Math.floor(
        randomValue * (messages.length - 1),
      );
      messageIndex =
        alternativeIndex < previousIndex
          ? alternativeIndex
          : alternativeIndex + 1;
    }

    this.previousSelections.set(category, messageIndex);
    return messages[messageIndex] ?? messages[0];
  }

  public isMessageInCategory(
    message: string,
    category: PersonalityMessageCategory,
  ): boolean {
    return this.requireCatalog(this.personality)[category].includes(message);
  }

  public getThinkingMessage(): string {
    return this.getMessage('thinking');
  }

  public getHydrationMessage(): string {
    return this.getMessage('hydration');
  }

  public getWelcomeMessage(): string {
    return this.getMessage('welcome');
  }

  public getProviderConnectedMessage(): string {
    return this.getMessage('providerConnected');
  }

  public getProviderFailedMessage(): string {
    return this.getMessage('providerFailed');
  }

  public getAIUnavailableMessage(): string {
    return this.getMessage('aiUnavailable');
  }

  public getCompletionMessage(): string {
    return this.getMessage('requestComplete');
  }

  public getRequestCompleteMessage(): string {
    return this.getMessage('requestComplete');
  }

  public getPomodoroCompletionMessage(): string {
    return this.getMessage('pomodoroComplete');
  }

  public getReminderCompletionMessage(): string {
    return this.getMessage('reminderComplete');
  }

  public getReminderCreatedMessage(): string {
    return this.getMessage('reminderCreated');
  }

  public getStickyMessageSavedMessage(): string {
    return this.getMessage('stickyMessageSaved');
  }

  public getStickyMessageUpdatedMessage(): string {
    return this.getMessage('stickyMessageUpdated');
  }

  public getAssistantActionFailedMessage(): string {
    return this.getMessage('assistantActionFailed');
  }

  public getErrorMessage(): string {
    return this.getMessage('error');
  }

  public subscribe(listener: PersonalityEventListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public emitStartupGreeting(): PersonalitySpeechEvent | null {
    return this.emitOnce(
      PERSONALITY_TRIGGERS.applicationStartup,
      'current-launch',
    );
  }

  public emitPomodoroCompletion(
    sourceEventId: string,
  ): PersonalitySpeechEvent | null {
    return this.emitOnce(
      PERSONALITY_TRIGGERS.pomodoroCompleted,
      sourceEventId,
    );
  }

  public emitReminderCompletion(
    sourceEventId: string,
  ): PersonalitySpeechEvent | null {
    return this.emitOnce(
      PERSONALITY_TRIGGERS.reminderCompleted,
      sourceEventId,
    );
  }

  public emitWaterReminderAcknowledgement(
    sourceEventId: string,
    selectedMessage?: string,
  ): PersonalitySpeechEvent | null {
    return this.emitOnce(
      PERSONALITY_TRIGGERS.waterReminderAcknowledged,
      sourceEventId,
      selectedMessage,
    );
  }

  public emitStickyMessageSaved(
    sourceEventId: string,
  ): PersonalitySpeechEvent | null {
    return this.emitOnce(
      PERSONALITY_TRIGGERS.stickyMessageSaved,
      sourceEventId,
    );
  }

  private readRandomValue(): number {
    try {
      return normalizeRandomValue(this.random());
    } catch {
      return 0;
    }
  }

  private requireCatalog(personality: string): PersonalityMessages {
    const catalog = this.catalogs[personality];

    if (catalog === undefined) {
      throw new RangeError(`Unknown personality: ${personality}`);
    }

    return catalog;
  }

  private emitOnce(
    trigger: PersonalityTrigger,
    sourceEventId: string,
    selectedMessage?: string,
  ): PersonalitySpeechEvent | null {
    const normalizedSourceEventId = sourceEventId.trim();

    if (
      normalizedSourceEventId.length === 0 ||
      normalizedSourceEventId.length > MAXIMUM_SOURCE_EVENT_ID_LENGTH
    ) {
      throw new TypeError(
        'Personality source event IDs must contain between 1 and 128 characters.',
      );
    }

    const processedEventKey = `${trigger}:${normalizedSourceEventId}`;

    if (this.processedSourceEvents.has(processedEventKey)) {
      return null;
    }

    const category = PERSONALITY_TRIGGER_MESSAGE_CATEGORIES[trigger];
    const message =
      selectedMessage === undefined
        ? this.getMessage(category)
        : selectedMessage.trim();

    if (
      message.length === 0 ||
      !this.isMessageInCategory(message, category)
    ) {
      throw new TypeError(
        `Personality messages for ${trigger} must come from its configured message pool.`,
      );
    }

    this.processedSourceEvents.add(processedEventKey);

    const event = Object.freeze<PersonalitySpeechEvent>({
      id: this.nextEventId,
      type: PERSONALITY_EVENT_TYPE,
      trigger,
      sourceEventId: normalizedSourceEventId,
      message,
    });
    this.nextEventId += 1;

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.onListenerError?.(error, event);
      }
    }

    return event;
  }
}
