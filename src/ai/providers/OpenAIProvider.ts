import { OpenAICompatibleProvider } from './OpenAICompatibleProvider';

export class OpenAIProvider extends OpenAICompatibleProvider {
  public constructor() {
    super('openai', 'OpenAI');
  }
}
