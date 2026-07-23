import type { AIResponse } from '../AIProvider';
import type { AssistantActionExecutor } from './AssistantActionExecutor';
import { interpretAssistantResponse } from './AssistantActionParser';

export class AssistantActionResponseProcessor {
  public constructor(
    private readonly executor: AssistantActionExecutor,
  ) {}

  public async process(response: AIResponse): Promise<AIResponse> {
    const interpretation = interpretAssistantResponse(response.content);

    if (interpretation.kind === 'message') {
      return {
        ...response,
        content: interpretation.content,
      };
    }

    const result = await this.executor.execute(interpretation.action);

    return {
      ...response,
      content: result.confirmation,
      finishReason: 'stop',
    };
  }
}
