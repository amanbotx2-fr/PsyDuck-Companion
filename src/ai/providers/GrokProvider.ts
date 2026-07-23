import { OpenAICompatibleProvider } from './OpenAICompatibleProvider';
import {
  MAXIMUM_AI_MODEL_CANDIDATES,
  MAXIMUM_AI_MODEL_DISPLAY_NAME_CHARACTERS,
  MAXIMUM_AI_MODEL_ID_CHARACTERS,
} from '../AIAbuseLimits';
import type { AIOperationOptions, AIModel } from '../AIProvider';
import { normalizeModels, toProviderError } from './providerUtils';

const XAI_API_BASE_URL = 'https://api.x.ai/v1';

interface GrokProviderOptions {
  readonly baseURL?: string;
}

const createModelsRequestUrl = (baseURL: string): string => {
  const normalizedBaseURL = baseURL.endsWith('/')
    ? baseURL
    : `${baseURL}/`;
  return new URL('models', normalizedBaseURL).toString();
};

interface XAILanguageModel {
  readonly id?: string;
  readonly aliases?: readonly string[];
  readonly output_modalities?: readonly string[];
}

interface XAILanguageModelsResponse {
  readonly models?: readonly XAILanguageModel[];
}

export class GrokProvider extends OpenAICompatibleProvider {
  public constructor(options: GrokProviderOptions = {}) {
    const baseURL = options.baseURL ?? XAI_API_BASE_URL;
    super('grok', 'Grok', {
      baseURL,
      connectionTestRequestUrl: createModelsRequestUrl(baseURL),
    });
  }

  public override async listModels(
    options: AIOperationOptions = {},
  ): Promise<readonly AIModel[]> {
    const client = this.requireClient();

    try {
      const response = await client.get<XAILanguageModelsResponse>(
        '/language-models',
        options.signal === undefined
          ? undefined
          : { signal: options.signal },
      );
      const languageModels = response.models ?? [];
      const models: AIModel[] = [];
      let inspectedModels = 0;

      modelLoop: for (const model of languageModels) {
        inspectedModels += 1;

        if (inspectedModels > MAXIMUM_AI_MODEL_CANDIDATES) {
          break;
        }

        if (
          model.output_modalities !== undefined &&
          !model.output_modalities.includes('text')
        ) {
          continue;
        }

        const rawId =
          typeof model.id === 'string' ? model.id : '';
        const id =
          rawId.length <= MAXIMUM_AI_MODEL_ID_CHARACTERS
            ? rawId.trim()
            : '';
        models.push({ id });

        if (models.length >= MAXIMUM_AI_MODEL_CANDIDATES) {
          break;
        }

        for (const alias of model.aliases ?? []) {
          if (
            typeof alias !== 'string' ||
            alias.length > MAXIMUM_AI_MODEL_ID_CHARACTERS
          ) {
            continue;
          }

          const hasBoundedDisplayName =
            alias.length + id.length + 3 <=
            MAXIMUM_AI_MODEL_DISPLAY_NAME_CHARACTERS;
          models.push({
            id: alias,
            ...(hasBoundedDisplayName
              ? { displayName: `${alias} (${id})` }
              : {}),
          });

          if (models.length >= MAXIMUM_AI_MODEL_CANDIDATES) {
            break modelLoop;
          }
        }
      }

      return normalizeModels(models);
    } catch (error) {
      throw toProviderError(this.id, this.displayName, error);
    }
  }
}
