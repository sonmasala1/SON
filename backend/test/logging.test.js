import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { logEvent, requestLogging } from '../src/services/logger.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

async function listen(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('request IDs, preflights, CORS rejections and database failures have one safe structured summary', async t => {
  const logs = [];
  const app = createApp({ config: { nodeEnv: 'test', testLogSink: record => logs.push(record) } });
  const base = await listen(t, app);
  const id = randomUUID();
  const response = await fetch(`${base}/api/v1/health?email=private-person@example.com&code=private-otp`, { headers: { Origin: 'http://localhost:3000', 'X-Request-ID': id, Cookie: 'session=private-cookie', Authorization: 'Bearer private-token' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-request-id'), id);
  assert.match(response.headers.get('access-control-expose-headers'), /X-Request-ID/i);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].requestId, id);
  assert.equal(logs[0].route, '/api/v1/health');
  assert.equal(logs[0].level, 'INFO');
  assert.ok(logs[0].durationMs >= 0);
  assert.equal(logs[0].method, 'GET');

  const preflight = await fetch(`${base}/api/v1/auth/email/send-otp`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:3000', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,idempotency-key,x-request-id' } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /x-request-id/i);
  assert.equal(logs.at(-1).method, 'OPTIONS');
  const rejection = await fetch(`${base}/api/v1/auth/email/send-otp`, { method: 'OPTIONS', headers: { Origin: 'https://private-untrusted.example', 'X-Request-ID': 'private-invalid-id' } });
  assert.equal(rejection.status, 403);
  assert.equal((await rejection.json()).requestId, rejection.headers.get('x-request-id'));
  assert.equal(logs.at(-1).reason, 'cors_origin_rejected');
  assert.equal(logs.at(-1).level, 'WARN');
  assert.notEqual(logs.at(-1).requestId, 'private-invalid-id');
  assert.equal(logs.at(-1).operation, 'email_otp.request');

  const unavailable = await fetch(`${base}/api/v1/products/private-sensitive-slug?q=private-search`);
  assert.equal(unavailable.status, 503);
  assert.equal(logs.at(-1).route, '/api/v1/products/:slug');
  assert.equal(logs.at(-1).operation, 'products');
  assert.equal(logs.at(-1).level, 'ERROR');
  await fetch(`${base}/api/v1/private-unknown-path/private-identity?token=private-value`);
  assert.equal(logs.at(-1).route, '/api/v1/:unmatched');
  assert.equal(logs.length, 5);
  assert.ok(logs.every(record => record.event === 'api.request'));
  assert.doesNotMatch(JSON.stringify(logs), /private-|Cookie|Authorization|Bearer|password|codeHash|tokenHash/);
});

test('server exceptions and arbitrary logger fields cannot expose secrets or personal data', async t => {
  const logs = [];
  const app = express();
  app.locals.config = { nodeEnv: 'test', testLogSink: record => logs.push(record) };
  app.use(requestLogging);
  const router = express.Router();
  router.get('/failure/:id', (req, _res, next) => {
    logEvent('ERROR', 'server.exception', { password: 'super-private-password', error: new Error('super-private-error'), email: 'super-private-email', reason: 'super-private-secret', code: 'super-private-code', status: 500 }, req);
    next(new Error('mongodb://user:super-private-password@server/private-db'));
  });
  app.use('/api/v1', router);
  app.use(errorHandler);
  const base = await listen(t, app);
  const response = await fetch(`${base}/api/v1/failure/super-private-identity`);
  assert.equal(response.status, 500);
  assert.equal((await response.json()).message, 'Something went wrong. Please try again.');
  assert.equal(logs.filter(record => record.event === 'api.request').length, 1);
  assert.equal(logs.at(-1).route, '/api/v1/failure/:id');
  assert.equal(logs.at(-1).reason, 'server_error');
  assert.doesNotMatch(JSON.stringify(logs), /super-private|mongodb:|stack|password|email/);
});
