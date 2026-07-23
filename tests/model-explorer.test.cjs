const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { describe, test } = require('node:test');

const {
  createModelExplorerCatalog,
  createModelReference,
  getModelBadgesWithRecommendation,
  getRecommendedModels,
  groupModelExplorerCatalog,
  recordRecentModel,
  resolveReferencedModels,
  searchModelExplorerCatalog,
  toggleFavoriteModel,
} = require('../dist/shared/modelMetadata.js');
const {
  MAXIMUM_RECENT_AI_MODELS_PER_PROVIDER,
  createDefaultSettings,
  parsePreferencesSettingsPatch,
  toPreferencesSettings,
  toRuntimeSettings,
} = require('../dist/shared/settings.js');
const { SettingsService } = require('../dist/main/SettingsService.js');

const unavailableCredentialManager = {
  decrypt: () => '',
  encrypt: () => {
    throw new Error('Credential storage is unavailable in this test.');
  },
  isEncryptionAvailable: () => false,
};

const createLegacySettingsDocument = () => ({
  userName: 'Aman',
  stickyMessage: null,
  reminders: [],
  general: {
    alwaysOnTop: true,
    launchAtStartup: false,
    eyeTracking: true,
  },
  water: {
    enabled: true,
    interval: 30,
  },
  ai: {
    enabled: true,
    provider: 'custom',
    model: 'openai/gpt-4.1-mini',
    endpoint: 'http://localhost:11434',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  credential: null,
});

describe('AI model explorer catalog', () => {
  test('searches 1,000 models by ID, provider, display name, and alias', () => {
    const sourceModels = [
      {
        id: 'google/gemma-3-27b-it:free',
        aliases: ['Gemma flagship'],
      },
      {
        id: 'anthropic/claude-sonnet-4',
        displayName: 'Claude Sonnet 4',
      },
      { id: 'openai/gpt-4.1-mini' },
      { id: 'google/gemini-2.5-flash' },
      ...Array.from({ length: 996 }, (_, index) => ({
        id: `catalog/model-${String(index).padStart(4, '0')}`,
      })),
    ];
    const catalog = createModelExplorerCatalog(sourceModels, 'custom');

    assert.equal(catalog.length, 1_000);
    assert.deepEqual(
      searchModelExplorerCatalog(catalog, 'gemma google').map(
        (model) => model.id,
      ),
      ['google/gemma-3-27b-it:free'],
    );
    assert.deepEqual(
      searchModelExplorerCatalog(catalog, 'flagship').map(
        (model) => model.id,
      ),
      ['google/gemma-3-27b-it:free'],
    );
    assert.deepEqual(
      searchModelExplorerCatalog(catalog, 'chatgpt 4.1').map(
        (model) => model.id,
      ),
      ['openai/gpt-4.1-mini'],
    );
    assert.deepEqual(
      searchModelExplorerCatalog(catalog, 'claude sonnet').map(
        (model) => model.id,
      ),
      ['anthropic/claude-sonnet-4'],
    );
    assert.equal(
      searchModelExplorerCatalog(catalog, 'model 0995')[0]?.id,
      'catalog/model-0995',
    );

    const groups = groupModelExplorerCatalog(catalog);
    assert.equal(groups[0]?.name, 'OpenAI');
    assert.equal(groups.some((group) => group.name === 'Anthropic'), true);
    assert.equal(groups.some((group) => group.name === 'Google'), true);
    assert.equal(groups.at(-1)?.name, 'Other');
  });

  test('recommends only catalog matches and emits defensible badges', () => {
    const catalog = createModelExplorerCatalog(
      [
        { id: 'google/gemma-3-27b-it:free' },
        { id: 'qwen/qwen3-32b:free' },
        { id: 'deepseek/deepseek-r1:free' },
        { id: 'openai/gpt-4.1-mini' },
        { id: 'anthropic/claude-sonnet-4' },
        { id: 'google/gemini-2.5-flash' },
      ],
      'custom',
    );
    const recommendations = getRecommendedModels(catalog);

    assert.equal(recommendations.length, 6);
    assert.deepEqual(
      recommendations.map(({ tier }) => tier),
      ['free', 'free', 'free', 'paid', 'paid', 'paid'],
    );
    assert.deepEqual(
      getModelBadgesWithRecommendation(
        recommendations[0].model,
        recommendations[0].tier,
      ),
      ['FREE'],
    );
    assert.deepEqual(
      getModelBadgesWithRecommendation(
        recommendations[3].model,
        recommendations[3].tier,
      ),
      ['PAID'],
    );

    const localCatalog = createModelExplorerCatalog(
      [{ id: 'llama3.2:latest' }],
      'ollama',
    );
    assert.deepEqual(localCatalog[0].badges, ['LOCAL']);
    assert.equal(localCatalog[0].providerGroup, 'Ollama');
  });
});

describe('AI model explorer preferences', () => {
  test('toggles favorites and keeps the five most recent models per provider', () => {
    let settings = {
      favorites: [],
      recent: [],
    };
    const favorite = createModelReference(
      'custom',
      'google/gemma-3-27b-it:free',
    );

    settings = toggleFavoriteModel(settings, favorite);
    assert.deepEqual(settings.favorites, [favorite]);
    settings = toggleFavoriteModel(settings, favorite);
    assert.deepEqual(settings.favorites, []);

    for (let index = 0; index < 7; index += 1) {
      settings = recordRecentModel(
        settings,
        createModelReference('custom', `model-${index}`),
      );
    }

    settings = recordRecentModel(
      settings,
      createModelReference('openai', 'gpt-4.1-mini'),
    );

    assert.deepEqual(
      settings.recent
        .filter(({ provider }) => provider === 'custom')
        .map(({ modelId }) => modelId),
      ['model-6', 'model-5', 'model-4', 'model-3', 'model-2'],
    );
    assert.equal(
      settings.recent.filter(({ provider }) => provider === 'custom')
        .length,
      MAXIMUM_RECENT_AI_MODELS_PER_PROVIDER,
    );
    assert.equal(
      settings.recent.find(({ provider }) => provider === 'openai')
        ?.modelId,
      'gpt-4.1-mini',
    );

    const catalog = createModelExplorerCatalog(
      Array.from({ length: 7 }, (_, index) => ({
        id: `model-${index}`,
      })),
      'custom',
    );
    assert.deepEqual(
      resolveReferencedModels(
        catalog,
        settings.recent,
        'custom',
        MAXIMUM_RECENT_AI_MODELS_PER_PROVIDER,
      ).map(({ id }) => id),
      ['model-6', 'model-5', 'model-4', 'model-3', 'model-2'],
    );
  });

  test('validates the settings capability payload', () => {
    const validPatch = parsePreferencesSettingsPatch({
      aiModelExplorer: {
        favorites: [
          {
            provider: 'custom',
            modelId: '  google/gemma-3-27b-it:free  ',
          },
        ],
        recent: [{ provider: 'openai', modelId: 'gpt-4.1-mini' }],
      },
    });

    assert.deepEqual(validPatch, {
      aiModelExplorer: {
        favorites: [
          {
            provider: 'custom',
            modelId: 'google/gemma-3-27b-it:free',
          },
        ],
        recent: [{ provider: 'openai', modelId: 'gpt-4.1-mini' }],
      },
    });
    assert.equal(
      parsePreferencesSettingsPatch({
        aiModelExplorer: {
          favorites: [{ provider: 'unknown', modelId: 'model' }],
        },
      }),
      null,
    );
    assert.equal(
      parsePreferencesSettingsPatch({
        aiModelExplorer: {
          recent: [{ provider: 'custom', modelId: '   ' }],
        },
      }),
      null,
    );
  });

  test('migrates, persists, and keeps explorer state out of runtime settings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'psyduck-models-'));
    const filePath = join(directory, 'settings.json');

    try {
      await writeFile(
        filePath,
        JSON.stringify(createLegacySettingsDocument()),
        'utf8',
      );
      const settingsService = new SettingsService(
        filePath,
        unavailableCredentialManager,
      );
      const migratedSettings = await settingsService.load();
      const migratedDocument = JSON.parse(await readFile(filePath, 'utf8'));

      assert.deepEqual(migratedSettings.aiModelExplorer, {
        favorites: [],
        recent: [],
      });
      assert.deepEqual(migratedDocument.aiModelExplorer, {
        favorites: [],
        recent: [],
      });
      assert.equal(
        Object.hasOwn(toRuntimeSettings(migratedSettings), 'aiModelExplorer'),
        false,
      );

      const explorerSettings = {
        favorites: [
          createModelReference('custom', 'google/gemma-3-27b-it:free'),
        ],
        recent: [
          createModelReference('custom', 'openai/gpt-4.1-mini'),
        ],
      };
      await settingsService.update({
        aiModelExplorer: explorerSettings,
      });

      const restoredService = new SettingsService(
        filePath,
        unavailableCredentialManager,
      );
      const restoredSettings = await restoredService.load();
      const preferences = toPreferencesSettings(restoredSettings);

      assert.deepEqual(preferences.aiModelExplorer, explorerSettings);
      assert.deepEqual(
        restoredSettings.aiModelExplorer,
        explorerSettings,
      );
      assert.equal(restoredSettings.userName, 'Aman');
      assert.equal(
        restoredSettings.ai.baseUrl,
        'https://openrouter.ai/api/v1',
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('provides empty explorer defaults for fresh settings', () => {
    assert.deepEqual(createDefaultSettings().aiModelExplorer, {
      favorites: [],
      recent: [],
    });
  });
});
