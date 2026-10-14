import test from 'node:test';
import assert from 'node:assert/strict';

import { createPublishHandler } from '../api/publish.js';

const allowedOrigin = 'https://admin.example.com';

function createResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end() {
      this.ended = true;
      return this;
    }
  };
}

function createRequest({ method = 'POST', origin = allowedOrigin, authorization = 'Bearer valid-token', body } = {}) {
  return {
    method,
    headers: { origin, authorization },
    body: body ?? { slug: 'mobile-published-article', status: 'published' }
  };
}

const env = {
  ADMIN_ALLOWED_ORIGINS: allowedOrigin,
  GITHUB_REPOSITORY: 'owner/site',
  GITHUB_TOKEN: 'test-token'
};

test('authorized admin requests dispatch the publishing workflow', async () => {
  const dispatched = [];
  const handler = createPublishHandler({
    env,
    verifyAdminToken: async (token) => {
      assert.equal(token, 'valid-token');
      return { admin: true };
    },
    dispatchWorkflow: async (...args) => {
      dispatched.push(args);
      return { triggered: true };
    }
  });
  const response = createResponse();

  await handler(createRequest(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.deepEqual(dispatched, [[
    'owner/site',
    'test-token',
    { slug: 'mobile-published-article', status: 'published' }
  ]]);
  assert.equal(response.headers['Access-Control-Allow-Origin'], allowedOrigin);
});

test('requests without a Firebase bearer token are rejected', async () => {
  const handler = createPublishHandler({
    env,
    verifyAdminToken: async () => {
      throw new Error('Must not verify a missing token');
    }
  });
  const response = createResponse();

  await handler(createRequest({ authorization: '' }), response);

  assert.equal(response.statusCode, 401);
});

test('authenticated non-admin users cannot dispatch publishing', async () => {
  const handler = createPublishHandler({
    env,
    verifyAdminToken: async () => ({ admin: false }),
    dispatchWorkflow: async () => {
      throw new Error('Must not dispatch for a non-admin user');
    }
  });
  const response = createResponse();

  await handler(createRequest(), response);

  assert.equal(response.statusCode, 403);
});

test('published requests with invalid slugs are rejected', async () => {
  const handler = createPublishHandler({
    env,
    verifyAdminToken: async () => ({ admin: true }),
    dispatchWorkflow: async () => {
      throw new Error('Must not dispatch an invalid slug');
    }
  });
  const response = createResponse();

  await handler(createRequest({ body: { slug: '../unsafe', status: 'published' } }), response);

  assert.equal(response.statusCode, 400);
});

test('requests from unapproved origins are rejected', async () => {
  const handler = createPublishHandler({ env });
  const response = createResponse();

  await handler(createRequest({ origin: 'https://untrusted.example.com' }), response);

  assert.equal(response.statusCode, 403);
  assert.equal(response.headers['Access-Control-Allow-Origin'], undefined);
});

test('preflight requests allow only the configured dashboard origin', async () => {
  const handler = createPublishHandler({ env });
  const response = createResponse();

  await handler(createRequest({ method: 'OPTIONS' }), response);

  assert.equal(response.statusCode, 204);
  assert.equal(response.ended, true);
  assert.equal(response.headers['Access-Control-Allow-Methods'], 'POST, OPTIONS');
});
