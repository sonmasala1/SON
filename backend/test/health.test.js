import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { maintainDatabaseConnection, getDatabaseStatus } from '../src/config/db.js';

test('versioned health API preserves response and frontend CORS access', async (t) => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/health`;
  const response = await fetch(url, { headers: { Origin: 'http://localhost:3000' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  assert.match(response.headers.get('access-control-expose-headers'), /retry-after/i);
  const data = await response.json();
  assert.equal(data.status, 'healthy');
  assert.equal(data.success, true);
  assert.equal(data.message, 'SON MASALA API is running');
  assert.ok(Number.isFinite(Date.parse(data.timestamp)));
});

test('CORS allows both approved origins and rejects another origin', async (t) => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  for (const origin of ['http://localhost:3000', 'https://son-dusky.vercel.app']) {
    const response = await fetch(`${base}/health`, { headers: { Origin: origin } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    for (const endpoint of ['cart', 'auth/me', 'products', 'auth/google/start', 'auth/email/send-otp', 'auth/email/resend-otp']) {
      const preflight = await fetch(`${base}/${endpoint}`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': endpoint.startsWith('auth/') ? 'POST' : 'GET', 'Access-Control-Request-Headers': 'content-type,idempotency-key' } });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
      assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
      assert.match(preflight.headers.get('access-control-allow-headers'), /idempotency-key/i);
    }
  }
  const response = await fetch(`${base}/health`, { headers: { Origin: 'https://untrusted.example' } });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  const preflight = await fetch(`${base}/newsletter`, { method: 'OPTIONS', headers: { Origin: 'https://son-dusky.vercel.app', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
});

test('unavailable MongoDB keeps liveness up but readiness and products return 503', async (t) => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  assert.equal((await fetch(`${base}/health`)).status, 200);
  const readiness = await fetch(`${base}/ready`);
  assert.equal(readiness.status, 503);
  assert.equal((await readiness.json()).dependencies.mongodb, 'disconnected');
  const products = await fetch(`${base}/products`);
  assert.equal(products.status, 503);
  const body = await products.json();
  assert.equal(body.success, false);
  assert.equal(body.products, undefined);
  assert.equal(JSON.stringify(body).includes('mongodb://'), false);
});

test('database-dependent APIs remain gated when MongoDB is unavailable', async t => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  for (const path of ['/products', '/categories', '/cart', '/auth/me', '/reviews']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 503, `${path} must wait for the database`);
    assert.equal((await response.json()).success, false);
  }
});

test('database connection refuses an implicit test database without confirmation', async () => {
  const connected = await maintainDatabaseConnection('mongodb://127.0.0.1:27017/');
  assert.equal(connected, false);
  assert.equal(getDatabaseStatus().connected, false);
  assert.match(getDatabaseStatus().error, /defaults to "test"/);
});
