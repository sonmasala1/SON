import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Review from '../src/models/Review.js';
import Product from '../src/models/Product.js';
import Order from '../src/models/Order.js';
import { createReview } from '../src/controllers/reviewController.js';
import { requireCustomer } from '../src/middleware/session.js';
import { customerOrigin } from '../src/services/customerSessionService.js';
import { reviewLimiters } from '../src/middleware/reviewSubmission.js';

// No MongoDB connection or persisted fixtures: every model operation is intercepted.
test('review identity, moderation, duplicate protection and purchase verification', async t => {
  let saved, duplicate = false, paid = false, purchaseQuery;
  t.mock.method(Product, 'exists', async () => true);
  t.mock.method(Review, 'exists', async () => duplicate);
  t.mock.method(Order, 'exists', async query => { purchaseQuery = query; return paid; });
  t.mock.method(Review, 'create', async value => { saved = value; return { id: 'in-memory-result' }; });
  const req = () => ({ user: { _id: '000000000000000000000001', emailVerified: true }, body: { productId: '000000000000000000000002', displayName: 'Test input', rating: 4, comment: 'Security validation input only.' }, requestId: '00000000-0000-4000-8000-000000000001', app: { locals: { config: { nodeEnv: 'test' } } }, customerSession: { verificationSource: 'BREVO' }, get: () => 'http://localhost:3000' });
  const run = async request => {
    let status = 200, error, response;
    await createReview(request, { status(value) { status = value; return this; }, json(value) { response = value; } }, value => { error = value; });
    return { status: error?.status || status, response };
  };
  const unverified = req(); unverified.user.emailVerified = false;
  assert.equal((await run(unverified)).status, 403);
  assert.equal(saved, undefined);
  assert.equal((await run(req())).status, 201);
  assert.equal(saved.approved, false); assert.equal(saved.verifiedPurchase, false);
  assert.equal(saved.submission.environment, 'test');
  assert.equal(saved.submission.verificationSource, 'BREVO');
  assert.equal(saved.submission.requestId, req().requestId);
  assert.deepEqual(purchaseQuery, { userId: req().user._id, isDemo: false, paymentStatus: 'PAID', 'items.productId': req().body.productId });
  paid = true;
  assert.equal((await run(req())).status, 201); assert.equal(saved.verifiedPurchase, true); assert.equal(saved.approved, false);
  duplicate = true;
  assert.equal((await run(req())).status, 409);
  const forged = req(); forged.body.approved = true; forged.body.verifiedPurchase = true; forged.body.submission = { environment: 'production' };
  assert.equal((await run(forged)).status, 400);
});

test('review route guards reject guests/cross-origin clients and throttle accounts', async t => {
  const app = express();
  app.locals.allowedOrigins = ['http://localhost:3000'];
  app.use((req, _res, next) => { if (req.get('X-Test-Identity')) req.user = { _id: req.get('X-Test-Identity') }; next(); });
  app.post('/reviews', requireCustomer, customerOrigin, ...reviewLimiters(), (_req, res) => res.sendStatus(204));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const send = headers => fetch(`http://127.0.0.1:${server.address().port}/reviews`, { method: 'POST', headers });
  assert.equal((await send({ Origin: 'http://localhost:3000' })).status, 401);
  assert.equal((await send({ 'X-Test-Identity': 'account-a' })).status, 403);
  assert.equal((await send({ 'X-Test-Identity': 'account-a', Origin: 'https://untrusted.invalid' })).status, 403);
  for (let index = 0; index < 5; index++) assert.equal((await send({ 'X-Test-Identity': 'account-a', Origin: 'http://localhost:3000' })).status, 204);
  const limited = await send({ 'X-Test-Identity': 'account-a', Origin: 'http://localhost:3000' });
  assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal((await send({ 'X-Test-Identity': 'account-b', Origin: 'http://localhost:3000' })).status, 204);
});
