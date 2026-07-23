const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { STATUS_CODES } = require('node:http');
const { describe, test } = require('node:test');

const {
  AIProviderError,
} = require('../dist/ai/AIProvider.js');
const {
  GrokProvider,
} = require('../dist/ai/providers/GrokProvider.js');
const {
  getGrokConnectionTestFailure,
} = require('../dist/main/AIConnectionDiagnostics.js');

const TEST_API_KEY = 'xai-test-secret-value';

const sendJson = (response, statusCode, body) => {
  response.writeHead(statusCode, {
    'content-type': 'application/json',
  });
  response.end(JSON.stringify(body));
};

const startApiServer = async (statusCode, apiError) => {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({
      authorization: request.headers.authorization,
      method: request.method,
      path: request.url,
    });
    sendJson(response, statusCode, { error: apiError });
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
    baseURL: `http://127.0.0.1:${address.port}/v1`,
    requests,
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

const initializeProvider = async (provider) => {
  await provider.initialize({
    apiKey: TEST_API_KEY,
    baseUrl: '',
    endpoint: 'http://localhost:11434',
    model: 'grok-test',
  });
};

describe('Grok connection diagnostics', () => {
  const cases = [
    {
      statusCode: 401,
      errorCode: 'invalid_api_key',
      errorMessage: 'Unauthorized.',
    },
    {
      statusCode: 403,
      errorCode: 'permission_denied',
      errorMessage: 'Forbidden.',
    },
    {
      statusCode: 404,
      errorCode: 'not_found',
      errorMessage: 'Not Found.',
    },
    {
      statusCode: 429,
      errorCode: 'insufficient_credits',
      errorMessage: 'Insufficient credits.',
    },
    {
      statusCode: 500,
      errorCode: 'internal_server_error',
      errorMessage: 'Internal Server Error.',
    },
  ];

  for (const testCase of cases) {
    test(`surfaces HTTP ${testCase.statusCode} without a generic replacement`, async (t) => {
      const api = await startApiServer(testCase.statusCode, {
        code: testCase.errorCode,
        message: testCase.errorMessage,
      });
      t.after(api.close);
      const provider = new GrokProvider({ baseURL: api.baseURL });
      const loggedEvents = [];

      await initializeProvider(provider);

      await assert.rejects(
        () => provider.testConnection(),
        (error) => {
          assert.equal(error instanceof AIProviderError, true);
          assert.equal(error.providerId, 'grok');
          assert.equal(error.code, 'connection');
          assert.match(error.message, /Grok connection failed/);
          assert.match(error.message, new RegExp(String(testCase.statusCode)));
          assert.match(error.message, new RegExp(testCase.errorMessage));
          assert.equal(error.message.includes(TEST_API_KEY), false);

          const diagnostics = error.httpDiagnostics;
          assert.ok(diagnostics);
          assert.equal(
            diagnostics.requestUrl,
            `${api.baseURL}/models`,
          );
          assert.equal(
            diagnostics.httpStatusCode,
            testCase.statusCode,
          );
          assert.equal(
            diagnostics.httpStatusText,
            STATUS_CODES[testCase.statusCode],
          );
          assert.equal(
            diagnostics.responseBody,
            JSON.stringify({
              error: {
                code: testCase.errorCode,
                message: testCase.errorMessage,
              },
            }),
          );
          assert.equal(diagnostics.errorCode, testCase.errorCode);
          assert.equal(
            diagnostics.errorMessage,
            testCase.errorMessage,
          );

          const result = getGrokConnectionTestFailure(
            error,
            (event, details) => {
              loggedEvents.push({ event, details });
            },
          );

          assert.deepEqual(result, {
            ok: false,
            message: error.message,
            diagnostics,
          });
          return true;
        },
      );

      assert.equal(loggedEvents.length, 1);
      assert.equal(
        loggedEvents[0].event,
        '[ai] grok_connection_test_failed',
      );
      assert.deepEqual(loggedEvents[0].details, {
        requestUrl: `${api.baseURL}/models`,
        httpStatusCode: testCase.statusCode,
        responseBody: JSON.stringify({
          error: {
            code: testCase.errorCode,
            message: testCase.errorMessage,
          },
        }),
        errorCode: testCase.errorCode,
        errorMessage: testCase.errorMessage,
      });
      assert.equal(
        JSON.stringify(loggedEvents).includes(TEST_API_KEY),
        false,
      );
      assert.equal(api.requests.length >= 1, true);
      assert.equal(api.requests[0].method, 'GET');
      assert.equal(api.requests[0].path, '/v1/models');
    });
  }

  test('redacts credential-shaped values and bounds the response body', async (t) => {
    const repeatedDetails = 'x'.repeat(3_000);
    const api = await startApiServer(401, {
      api_key: TEST_API_KEY,
      code: 'invalid_api_key',
      message: `Rejected Bearer ${TEST_API_KEY}. ${repeatedDetails}`,
    });
    t.after(api.close);
    const provider = new GrokProvider({ baseURL: api.baseURL });

    await initializeProvider(provider);

    await assert.rejects(
      () => provider.testConnection(),
      (error) => {
        const diagnostics = error.httpDiagnostics;
        assert.ok(diagnostics);
        assert.equal(diagnostics.responseBody.length <= 2_048, true);
        assert.equal(
          diagnostics.responseBody.includes('[redacted]'),
          true,
        );
        assert.equal(
          diagnostics.responseBody.includes(TEST_API_KEY),
          false,
        );
        assert.equal(error.message.includes(TEST_API_KEY), false);
        return true;
      },
    );
  });
});
