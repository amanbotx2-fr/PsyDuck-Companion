import {
  PERSONALITY_MESSAGE_CATALOGS,
  type PersonalityId,
  type PersonalityMessageCategory,
  type PersonalityMessages,
} from './messages';

export interface PersonalityServiceOptions {
  readonly personality?: PersonalityId;
  readonly random?: () => number;
  readonly catalogs?: Readonly<Record<string, PersonalityMessages>>;
}

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
  private personality: PersonalityId;

  public constructor(options: PersonalityServiceOptions = {}) {
    this.catalogs = options.catalogs ?? PERSONALITY_MESSAGE_CATALOGS;
    this.random = options.random ?? Math.random;
    this.personality = options.personality ?? 'default';
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

  public getErrorMessage(): string {
    return this.getMessage('error');
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
}

