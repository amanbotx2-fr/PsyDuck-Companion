import type { CreateReminderInput } from '../../shared/reminders';
import type {
  AssistantAction,
  AssistantActionExecutionResult,
  AssistantActionType,
} from './AssistantAction';

export interface AssistantActionReminderService {
  readonly createReminder: (input: CreateReminderInput) => Promise<unknown>;
}

export interface AssistantActionSettingsService {
  readonly updateStickyMessage: (message: unknown) => Promise<string | null>;
}

export interface AssistantActionMessageService {
  readonly getReminderCreatedMessage: () => string;
  readonly getStickyMessageUpdatedMessage: () => string;
}

export interface AssistantActionExecutorDependencies {
  readonly reminderService: AssistantActionReminderService;
  readonly settingsService: AssistantActionSettingsService;
  readonly messages: AssistantActionMessageService;
}

type AssistantActionHandler = (
  action: AssistantAction,
) => Promise<AssistantActionExecutionResult>;

export class AssistantActionExecutionError extends Error {
  public constructor() {
    super('The assistant action is not registered.');
    this.name = 'AssistantActionExecutionError';
  }
}

export class AssistantActionExecutor {
  // Keep registration private so runtime data cannot add capabilities.
  private readonly handlers = new Map<
    AssistantActionType,
    AssistantActionHandler
  >();

  public constructor(dependencies: AssistantActionExecutorDependencies) {
    this.register('createReminder', async (action) => {
      if (action.type !== 'createReminder') {
        throw new AssistantActionExecutionError();
      }

      await dependencies.reminderService.createReminder(action.payload);
      return {
        actionType: action.type,
        confirmation: dependencies.messages.getReminderCreatedMessage(),
      };
    });

    this.register('setStickyMessage', async (action) => {
      if (action.type !== 'setStickyMessage') {
        throw new AssistantActionExecutionError();
      }

      await dependencies.settingsService.updateStickyMessage(
        action.payload.message,
      );
      return {
        actionType: action.type,
        confirmation:
          dependencies.messages.getStickyMessageUpdatedMessage(),
      };
    });
  }

  public async execute(
    action: AssistantAction,
  ): Promise<AssistantActionExecutionResult> {
    const handler = this.handlers.get(action.type);

    if (handler === undefined) {
      throw new AssistantActionExecutionError();
    }

    return handler(action);
  }

  private register(
    type: AssistantActionType,
    handler: AssistantActionHandler,
  ): void {
    if (this.handlers.has(type)) {
      throw new TypeError(`Duplicate assistant action: ${type}`);
    }

    this.handlers.set(type, handler);
  }
}
