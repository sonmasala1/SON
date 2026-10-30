import test from 'node:test';
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { sendOtpEmail, otpEmailTemplate } from '../src/services/emailService.js';
import { BREVO_EMAIL_URL } from '../src/services/brevoEmailService.js';

const code = () => String(randomInt(1000000)).padStart(6, '0');
function fixture(request) {
  const logs = [], calls = [];
  const req = { method: 'POST', originalUrl: '/api/v1/auth/email/send-otp', app: { locals: { config: {
    nodeEnv: 'test', emailProvider: 'brevo', brevoApiKey: 'xkeysib-test-only-api-key', brevoSenderEmail: 'verified@example.com', brevoSenderName: 'SON MASALA',
    testLogSink: record => logs.push(record),
    brevoFetch: async (...args) => { calls.push(args); return request(...args); },
  } } } };
  return { req, calls, logs };
}

test('Brevo sends one branded email by HTTPS with provider idempotency and private logs', async () => {
  const { req, calls, logs } = fixture(async () => new Response(JSON.stringify({ messageId: 'test-message-id' }), { status: 201 }));
  const otp = code();
  assert.equal(await sendOtpEmail(req, { to: 'private-customer@example.com', code: otp }), 'BREVO');
  assert.equal(calls.length, 1);
  const [url, options] = calls[0], body = JSON.parse(options.body);
  assert.equal(url, BREVO_EMAIL_URL);
  assert.equal(options.method, 'POST');
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers['api-key'], 'xkeysib-test-only-api-key');
  assert.ok(options.signal instanceof AbortSignal);
  assert.deepEqual(body.sender, { email: 'verified@example.com', name: 'SON MASALA' });
  assert.deepEqual(body.to, [{ email: 'private-customer@example.com' }]);
  assert.match(body.headers.idempotencyKey, /^[a-f0-9-]{36}$/);
  assert.ok(body.htmlContent.includes(otp));
  assert.match(body.htmlContent, /#102f28/);
  assert.match(body.textContent, /5 minutes/);
  assert.match(body.textContent, /Do not share/);
  assert.deepEqual(logs.map(record => record.event), ['email.api.request', 'email.api.accepted']);
  assert.equal(logs.at(-1).status, 201);
  assert.doesNotMatch(JSON.stringify(logs), /xkeysib-test-only-api-key|private-customer|verified@example|test-message-id|htmlContent|textContent/);
});

for (const [status, reason] of [[400, 'brevo_rejected'], [401, 'brevo_authentication'], [403, 'brevo_permission'], [500, 'brevo_unavailable'], [503, 'brevo_unavailable']]) {
  test(`Brevo ${status} is sanitized and never automatically retried`, async () => {
    const { req, calls, logs } = fixture(async () => new Response(JSON.stringify({ message: 'private-provider-message', apiKey: 'private-secret' }), { status }));
    await assert.rejects(sendOtpEmail(req, { to: 'private-recipient@example.com', code: code() }), error => error.status === 503 && error.logReason === reason && !error.message.includes('private-'));
    assert.equal(calls.length, 1);
    assert.equal(logs.at(-1).reason, reason);
    assert.doesNotMatch(JSON.stringify(logs), /private-/);
  });
}

test('Brevo 401 classifies authentication failure with safe error code and never retries', async () => {
  const { req, calls, logs } = fixture(async () => new Response(JSON.stringify({ code: 'unauthorized', message: 'Key not found' }), { status: 401 }));
  await assert.rejects(
    sendOtpEmail(req, { to: 'customer@example.com', code: code() }),
    error => error.status === 503 && error.logReason === 'brevo_authentication'
  );
  assert.equal(calls.length, 1);
  assert.equal(logs.at(-1).event, 'email.api.failed');
  assert.equal(logs.at(-1).status, 401);
  assert.equal(logs.at(-1).providerCode, 'unauthorized');
  assert.equal(logs.at(-1).reason, 'brevo_authentication');
});

test('Brevo 403 classifies permission failure with safe error code', async () => {
  const { req, calls, logs } = fixture(async () => new Response(JSON.stringify({ code: 'permission_denied', message: 'Feature not allowed' }), { status: 403 }));
  await assert.rejects(
    sendOtpEmail(req, { to: 'customer@example.com', code: code() }),
    error => error.status === 503 && error.logReason === 'brevo_permission'
  );
  assert.equal(calls.length, 1);
  assert.equal(logs.at(-1).event, 'email.api.failed');
  assert.equal(logs.at(-1).status, 403);
  assert.equal(logs.at(-1).providerCode, 'permission_denied');
  assert.equal(logs.at(-1).reason, 'brevo_permission');
});

test('Brevo 400 with unverified sender classifies sender error specifically', async () => {
  const { req, calls, logs } = fixture(async () => new Response(JSON.stringify({ code: 'invalid_parameter', message: 'Sender email is not verified' }), { status: 400 }));
  await assert.rejects(
    sendOtpEmail(req, { to: 'customer@example.com', code: code() }),
    error => error.status === 503 && error.logReason === 'brevo_sender_invalid'
  );
  assert.equal(calls.length, 1);
  assert.equal(logs.at(-1).event, 'email.api.failed');
  assert.equal(logs.at(-1).status, 400);
  assert.equal(logs.at(-1).providerCode, 'invalid_parameter');
  assert.equal(logs.at(-1).reason, 'brevo_sender_invalid');
});

test('Brevo SMTP key (xsmtpsib-) is rejected before making any network call', async () => {
  const { req, calls, logs } = fixture(async () => assert.fail('Must not dispatch HTTPS request with SMTP key'));
  req.app.locals.config.brevoApiKey = 'xsmtpsib-mock-smtp-relay-key-1234567890';
  await assert.rejects(
    sendOtpEmail(req, { to: 'customer@example.com', code: code() }),
    error => error.status === 503 && error.logReason === 'brevo_authentication' && error.message.includes('Brevo v3 API key')
  );
  assert.equal(calls.length, 0);
  assert.equal(logs.at(-1).event, 'email.api.failed');
  assert.equal(logs.at(-1).providerCode, 'smtp_key_detected');
  assert.doesNotMatch(JSON.stringify(logs), /xsmtpsib/);
});

for (const [headers, wait] of [[{ 'Retry-After': '120' }, 120], [{ 'x-sib-ratelimit-reset': '90' }, 90], [{ 'Retry-After': '2' }, 60], [{}, 60]]) {
  test(`Brevo rate limiting obeys provider headers and at least 60s cooldown (${wait}s)`, async () => {
    const { req, calls } = fixture(async () => new Response('{}', { status: 429, headers }));
    await assert.rejects(sendOtpEmail(req, { to: 'recipient@example.com', code: code() }), error => error.status === 429 && error.retryAfter === wait);
    assert.equal(calls.length, 1);
  });
}

test('uncertain timeouts or invalid acceptance responses do not trigger a second send', async () => {
  for (const response of [async () => { throw new DOMException('private-error', 'TimeoutError'); }, async () => new Response('not-json', { status: 201 }), async () => new Response('{}', { status: 201 })]) {
    const { req, calls, logs } = fixture(response);
    await assert.rejects(sendOtpEmail(req, { to: 'recipient@example.com', code: code() }), error => error.status === 503 && !error.message.includes('private-'));
    assert.equal(calls.length, 1);
    assert.equal(logs.at(-1).event, 'email.api.failed');
  }
});

test('missing/unsupported configuration and invalid templates fail before any network call', async () => {
  for (const values of [{ brevoApiKey: '' }, { brevoSenderEmail: '' }, { emailProvider: 'gmail' }, { brevoSenderName: 'invalid\nheader' }]) {
    const { req, calls } = fixture(async () => assert.fail('must not dispatch'));
    Object.assign(req.app.locals.config, values);
    await assert.rejects(sendOtpEmail(req, { to: 'recipient@example.com', code: code() }), { status: 503 });
    assert.equal(calls.length, 0);
  }
  assert.throws(() => otpEmailTemplate('<script>'), { status: 422 });
});

test('production ignores test delivery hooks (all actual network I/O is mocked by the test runner)', async t => {
  const realFetch = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ messageId: 'test-accepted' }), { status: 201 }));
  const { req, calls } = fixture(async () => assert.fail('configuration test fetch must not run'));
  req.app.locals.config.nodeEnv = 'production';
  req.app.locals.config.emailDeliveryAdapter = async () => assert.fail('test adapter must not run');
  await sendOtpEmail(req, { to: 'recipient@example.com', code: code() });
  assert.equal(calls.length, 0);
  assert.equal(realFetch.mock.callCount(), 1);
});
