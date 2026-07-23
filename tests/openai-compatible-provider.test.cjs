const assert = require('node:assert/strict');
const { readFile, mkdtemp, rm } = require('node:fs/promises');
const { createServer } = require('node:http');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { describe, test } = require('node:test');

const { AIService } = require('../dist/ai/AIService.js');
const {
  AIProviderError,
} = require('../dist/ai/AIProvider.js');
const {
  AssistantActionExecutor,
  AssistantActionResponseProcessor,
} = require('../dist/ai/actions/index.js');
const {
  OpenAICompatibleProvider,
} = require('../dist/ai/providers/OpenAICompatibleProvider.js');
const { SettingsService } = require('../dist/main/SettingsService.js');
const {
  normalizeOpenAICompatibleBaseUrl,
  toPreferencesSettings,
} = require('../dist/shared/settings.js');

const createCustomProvider = () =>
  new OpenAICompatibleProvider('custom', 'Custom provider', {
    apiKeyRequired: false,
    modelDiscoveryOptional: true,
    requestProtocol: 'auto',
    useConfiguredBaseUrl: true,
  });

const readRequestBody = async (request) => {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
};

const sendJson = (response, statusCode, body) => {
  response.writeHead(statusCode, {
    'content-type': 'application/json',
  });
  response.end(JSON.stringify(body));
};

const startApiServer = async (handleRequest) => {
  const server = createServer((request, response) => {
    void Promise.resolve(handleRequest(request, response)).catch(() => {
      if (!response.headersSent) {
        sendJson(response, 500, { error: { message: 'Test failure.' } });
      } else {
        response.end();
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();

  if (address === null || typeof address === 'string') {
    throw new Error('The test API server did not expose a TCP address.');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) {
            resolve();
          } else {
            reject(error);
          }
        });
      }),
  };
};

const configureService = async (
  service,
  baseUrl,
  { apiKey = '', model = 'manual-model' } = {},
) => {
  await service.configure({
    enabled: true,
    provider: 'custom',
    model,
    apiKey,
    endpoint: 'http://localhost:11434',
    baseUrl,
  });
};

describe('OpenAI-compatible endpoint validation', () => {
  test('accepts HTTPS, loopback HTTP, and private-LAN HTTP endpoints', () => {
    assert.equal(
      normalizeOpenAICompatibleBaseUrl(
        ' https://openrouter.ai/api/v1/ ',
      ),
      'https://openrouter.ai/api/v1',
    );
    assert.equal(
      normalizeOpenAICompatibleBaseUrl('http://localhost:1234/v1'),
      'http://localhost:1234/v1',
    );
    assert.equal(
      normalizeOpenAICompatibleBaseUrl('http://127.0.0.1:8000/v1/'),
      'http://127.0.0.1:8000/v1',
    );
    assert.equal(
      normalizeOpenAICompatibleBaseUrl(
        'http://192.168.1.25:8000/v1',
      ),
      'http://192.168.1.25:8000/v1',
    );
    assert.equal(
      normalizeOpenAICompatibleBaseUrl('http://10.0.0.8/v1'),
      'http://10.0.0.8/v1',
    );
    assert.equal(
      normalizeOpenAICompatibleBaseUrl('http://172.31.4.2/v1'),
      'http://172.31.4.2/v1',
    );
  });

  test('rejects malformed, credentialed, and unsafe cleartext URLs', () => {
    const invalidValues = [
      '',
      'not a URL',
      'ftp://localhost/v1',
      'http://example.com/v1',
      'http://169.254.169.254/latest',
      'http://user:password@localhost:1234/v1',
      'http://localhost:1234/v1?token=secret',
      'http://localhost:1234/v1#models',
    ];

    for (const value of invalidValues) {
      assert.equal(normalizeOpenAICompatibleBaseUrl(value), null);
    }
  });
});

describe('OpenAI-compatible provider', () => {
  test('loads models and chats with a manual model without an API key', async (t) => {
    const requests = [];
    const api = await startApiServer(async (request, response) => {
      requests.push({
        authorization: request.headers.authorization,
        method: request.method,
        path: request.url,
        body: await readRequestBody(request),
      });

      if (request.method === 'GET' && request.url === '/v1/models') {
        sendJson(response, 200, {
          object: 'list',
          data: [
            { id: 'zeta-model', object: 'model', created: 1 },
            { id: 'alpha-model', object: 'model', created: 1 },
            { id: 'alpha-model', object: 'model', created: 1 },
          ],
        });
        return;
      }

      if (
        request.method === 'POST' &&
        request.url === '/v1/chat/completions'
      ) {
        sendJson(response, 200, {
          id: 'chatcmpl-test',
          object: 'chat.completion',
          created: 1,
          model: 'manual-model',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Custom response.',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 4,
            completion_tokens: 2,
            total_tokens: 6,
          },
        });
        return;
      }

      sendJson(response, 404, { error: { message: 'Not found.' } });
    });
    t.after(api.close);
    const service = new AIService([createCustomProvider()]);
    t.after(() => service.dispose());

    await configureService(service, api.baseUrl);
    const connection = await service.testConnection();
    const models = await service.listModels();
    const response = await service.ask('Hello.');

    assert.equal(service.activeProviderId, 'custom');
    assert.equal(connection.message, 'Connection successful.');
    assert.deepEqual(models, [
      { id: 'alpha-model' },
      { id: 'zeta-model' },
    ]);
    assert.equal(response.providerId, 'custom');
    assert.equal(response.content, 'Custom response.');
    assert.deepEqual(response.usage, {
      inputTokens: 4,
      outputTokens: 2,
    });
    assert.equal(
      requests.every((request) => request.authorization === undefined),
      true,
    );

    const chatRequest = requests.find(
      (request) => request.path === '/v1/chat/completions',
    );
    assert.ok(chatRequest);
    assert.equal(JSON.parse(chatRequest.body).model, 'manual-model');
  });

  test('uses Bearer authentication when an API key is configured', async (t) => {
    const authorizationHeaders = [];
    const api = await startApiServer(async (request, response) => {
      authorizationHeaders.push(request.headers.authorization);
      await readRequestBody(request);
      sendJson(response, 200, { object: 'list', data: [] });
    });
    t.after(api.close);
    const service = new AIService([createCustomProvider()]);
    t.after(() => service.dispose());

    await configureService(service, api.baseUrl, {
      apiKey: 'test-secret-key',
    });
    await service.testConnection();

    assert.deepEqual(authorizationHeaders, [
      'Bearer test-secret-key',
    ]);
  });

  test('keeps manual model entry available when discovery is unsupported', async (t) => {
    const api = await startApiServer(async (request, response) => {
      await readRequestBody(request);

      if (request.url === '/v1/models') {
        sendJson(response, 404, {
          error: { message: 'Models route is unavailable.' },
        });
        return;
      }

      sendJson(response, 404, { error: { message: 'Not found.' } });
    });
    t.after(api.close);
    const service = new AIService([createCustomProvider()]);
    t.after(() => service.dispose());

    await configureService(service, api.baseUrl, {
      model: 'server-defined-model',
    });

    assert.deepEqual(await service.listModels(), []);
    assert.deepEqual(await service.testConnection(), {
      message: 'Connection successful. Models endpoint unavailable.',
    });
    assert.equal(service.isConfigured, true);
  });

  test('falls back to the Responses API when Chat Completions is unavailable', async (t) => {
    const requestedPaths = [];
    const api = await startApiServer(async (request, response) => {
      requestedPaths.push(request.url);
      await readRequestBody(request);

      if (request.url === '/v1/chat/completions') {
        sendJson(response, 404, {
          error: { message: 'Chat Completions is unavailable.' },
        });
        return;
      }

      if (request.url === '/v1/responses') {
        sendJson(response, 200, {
          id: 'resp-test',
          object: 'response',
          created_at: 1,
          status: 'completed',
          model: 'responses-model',
          output: [
            {
              id: 'message-test',
              type: 'message',
              status: 'completed',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'Responses fallback.',
                  annotations: [],
                },
              ],
            },
          ],
          usage: {
            input_tokens: 3,
            output_tokens: 2,
            total_tokens: 5,
          },
        });
        return;
      }

      sendJson(response, 404, { error: { message: 'Not found.' } });
    });
    t.after(api.close);
    const service = new AIService([createCustomProvider()]);
    t.after(() => service.dispose());

    await configureService(service, api.baseUrl, {
      model: 'responses-model',
    });
    const response = await service.ask('Use the supported endpoint.');

    assert.equal(response.content, 'Responses fallback.');
    assert.deepEqual(requestedPaths, [
      '/v1/chat/completions',
      '/v1/responses',
    ]);
  });

  test('rejects invalid configuration and failed authentication safely', async (t) => {
    const invalidProvider = createCustomProvider();
    await invalidProvider.initialize({
      apiKey: '',
      baseUrl: 'http://example.com/v1',
      endpoint: 'http://localhost:11434',
      model: 'model',
    });

    assert.equal(invalidProvider.isConfigured(), false);
    await assert.rejects(
      () => invalidProvider.testConnection(),
      (error) =>
        error instanceof AIProviderError &&
        error.code === 'configuration' &&
        /base URL/i.test(error.message),
    );

    const api = await startApiServer(async (request, response) => {
      await readRequestBody(request);
      sendJson(response, 401, {
        error: { message: 'Invalid API key.' },
      });
    });
    t.after(api.close);
    const provider = createCustomProvider();
    await provider.initialize({
      apiKey: 'invalid-key',
      baseUrl: api.baseUrl,
      endpoint: 'http://localhost:11434',
      model: 'model',
    });

    await assert.rejects(
      () => provider.testConnection(),
      (error) =>
        error instanceof AIProviderError &&
        error.code === 'connection' &&
        /API key/i.test(error.message) &&
        !error.message.includes('invalid-key'),
    );
  });

  test('returns a bounded provider error when the endpoint fails', async (t) => {
    const api = await startApiServer(async (request, response) => {
      await readRequestBody(request);
      sendJson(response, 503, {
        error: { message: 'Service unavailable.' },
      });
    });
    t.after(api.close);
    const provider = createCustomProvider();
    await provider.initialize({
      apiKey: '',
      baseUrl: api.baseUrl,
      endpoint: 'http://localhost:11434',
      model: 'model',
    });

    await assert.rejects(
      () => provider.testConnection(),
      (error) =>
        error instanceof AIProviderError &&
        error.code === 'connection' &&
        /temporarily unavailable/i.test(error.message),
    );
  });

  test('preserves reminder and sticky-message actions', async (t) => {
    const actionResponses = [
      {
        type: 'createReminder',
        payload: {
          title: 'Review release',
          message: 'Check the deployment notes.',
          scheduledAt: '2030-01-02T12:00:00.000Z',
        },
      },
      {
        type: 'setStickyMessage',
        payload: {
          message: 'Review the deployment checklist.',
        },
      },
    ];
    const api = await startApiServer(async (request, response) => {
      await readRequestBody(request);

      if (request.url === '/v1/chat/completions') {
        sendJson(response, 200, {
          id: 'chatcmpl-action',
          object: 'chat.completion',
          created: 1,
          model: 'action-model',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify(actionResponses.shift()),
              },
              finish_reason: 'stop',
            },
          ],
        });
        return;
      }

      sendJson(response, 404, { error: { message: 'Not found.' } });
    });
    t.after(api.close);
    const service = new AIService([createCustomProvider()]);
    t.after(() => service.dispose());
    const reminderInputs = [];
    const stickyMessageInputs = [];
    const processor = new AssistantActionResponseProcessor(
      new AssistantActionExecutor({
        reminderService: {
          createReminder: async (input) => {
            reminderInputs.push(input);
          },
        },
        settingsService: {
          updateStickyMessage: async (message) => {
            stickyMessageInputs.push(message);
            return String(message);
          },
        },
        messages: {
          getReminderCreatedMessage: () => 'Reminder created.',
          getStickyMessageUpdatedMessage: () =>
            'Sticky message updated.',
        },
      }),
    );

    await configureService(service, api.baseUrl, {
      model: 'action-model',
    });
    const reminderResult = await processor.process(
      await service.ask('Create the reminder.'),
    );
    const stickyResult = await processor.process(
      await service.ask('Set the sticky message.'),
    );

    assert.equal(reminderResult.providerId, 'custom');
    assert.equal(reminderResult.content, 'Reminder created.');
    assert.equal(stickyResult.content, 'Sticky message updated.');
    assert.deepEqual(reminderInputs, [
      {
        title: 'Review release',
        message: 'Check the deployment notes.',
        scheduledAt: '2030-01-02T12:00:00.000Z',
      },
    ]);
    assert.deepEqual(stickyMessageInputs, [
      'Review the deployment checklist.',
    ]);
  });
});

describe('custom provider settings', () => {
  test('persists the base URL and model while keeping the API key protected', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'psyduck-custom-provider-'),
    );
    const filePath = join(directory, 'settings.json');
    const credentialManager = {
      isEncryptionAvailable: () => true,
      encrypt: (value) => ({
        version: 1,
        ciphertext: Buffer.from(value, 'utf8').toString('base64'),
      }),
      decrypt: (credential) =>
        Buffer.from(credential.ciphertext, 'base64').toString('utf8'),
    };

    try {
      const settingsService = new SettingsService(
        filePath,
        credentialManager,
      );
      await settingsService.load();
      const settings = await settingsService.updateAiConfiguration({
        enabled: true,
        provider: 'custom',
        model: 'manual-model',
        endpoint: 'http://localhost:11434',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'protected-test-key',
      });
      const preferences = toPreferencesSettings(settings);
      const persisted = JSON.parse(await readFile(filePath, 'utf8'));

      assert.equal(preferences.ai.provider, 'custom');
      assert.equal(preferences.ai.baseUrl, 'https://openrouter.ai/api/v1');
      assert.equal(preferences.ai.model, 'manual-model');
      assert.equal(preferences.ai.apiKeyConfigured, true);
      assert.equal(Object.hasOwn(preferences.ai, 'apiKey'), false);
      assert.equal(
        persisted.ai.baseUrl,
        'https://openrouter.ai/api/v1',
      );
      assert.equal(Object.hasOwn(persisted.ai, 'apiKey'), false);
      assert.notEqual(persisted.credential, null);

      const restoredService = new SettingsService(
        filePath,
        credentialManager,
      );
      const restored = await restoredService.load();

      assert.equal(restored.ai.provider, 'custom');
      assert.equal(
        restored.ai.baseUrl,
        'https://openrouter.ai/api/v1',
      );
      assert.equal(restoredService.getApiKey(), 'protected-test-key');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
