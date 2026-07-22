import { OpenAICompatibleProvider } from './OpenAICompatibleProvider';
import type { AIModel } from '../AIProvider';
import { normalizeModels, toProviderError } from './providerUtils';

const XAI_API_BASE_URL = 'https://api.x.ai/v1';

interface XAILanguageModel {
  readonly id?: string;
  readonly aliases?: readonly string[];
  readonly output_modalities?: readonly string[];
}

interface XAILanguageModelsResponse {
  readonly models?: readonly XAILanguageModel[];
}

export class GrokProvider extends OpenAICompatibleProvider {
  public constructor() {
    super('grok', 'Grok', XAI_API_BASE_URL);
  }

  public override async listModels(): Promise<readonly AIModel[]> {
    const client = this.requireClient();

    try {
      const response = await client.get<XAILanguageModelsResponse>(
        '/language-models',
      );
      const languageModels = response.models ?? [];

      return normalizeModels(
        languageModels.flatMap((model) => {
          if (
            model.output_modalities !== undefined &&
            !model.output_modalities.includes('text')
          ) {
            return [];
          }

          const id = model.id?.trim() ?? '';
          const aliases = model.aliases ?? [];

          return [
            { id },
            ...aliases.map((alias) => ({
              id: alias,
              displayName: `${alias} (${id})`,
            })),
          ];
        }),
      );
    } catch (error) {
      throw toProviderError(this.id, this.displayName, error);
    }
  }
}
