import { OpenAICompatibleProvider } from './OpenAICompatibleProvider';

const XAI_API_BASE_URL = 'https://api.x.ai/v1';

export class GrokProvider extends OpenAICompatibleProvider {
  public constructor() {
    super('grok', 'Grok', XAI_API_BASE_URL);
  }
}
