import mongoose from 'mongoose';
import { randomBytes, randomInt } from 'node:crypto';
import { EmailOtp, EmailThrottle, EmailDispatch } from '../models/emailAuthentication.js';
import { customerDigest, equals, encryptCustomerSecret, decryptCustomerSecret } from './staffCrypto.js';
import { customerNow, tokenHash } from './customerSessionService.js';
import { sendOtpEmail } from './emailService.js';
import { httpError } from '../utils/httpError.js';
import { logEvent } from './logger.js';

export const EMAIL_OTP_EXPIRY_MS  = 5 * 60000;   // 5 minutes
export const EMAIL_OTP_COOLDOWN_MS = 60000;       // 1 minute

export async function idempotentEmailDispatch(req, input, dispatch) {
  const key = req.get('Idempotency-Key');
  // Older clients remain protected by the transactional per-email throttle.
  if (!key) return dispatch();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw httpError(422, 'Invalid request key. Please refresh and try again.');
  const config = req.app.locals.config;
  const id = customerDigest(`email-dispatch:${key}`, config);
  const fingerprint = customerDigest(JSON.stringify([req.path, input]), config);
  try {
    await EmailDispatch.create({ _id: id, fingerprint, status: 'PENDING', expiresAt: new Date(customerNow(req) + 86400000) });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const prior = await EmailDispatch.findById(id).select('+responseEncrypted');
    if (!prior || prior.fingerprint !== fingerprint) throw httpError(409, 'This request key was already used for another action.');
    if (prior.status === 'COMPLETE') {
      const result = JSON.parse(decryptCustomerSecret(prior.responseEncrypted, config, id));
      const challenge = await EmailOtp.findOne({ tokenHash: tokenHash(result.challengeToken), status: 'ACTIVE', expiresAt: { $gt: new Date(customerNow(req)) } });
      if (!challenge) throw httpError(409, 'This request has already completed. Please request a new code.');
      logEvent('INFO', 'otp.idempotency.replayed', {}, req);
      return { ...result, serverTime: new Date(customerNow(req)).toISOString() };
    }
    if (prior.status === 'FAILED') throw Object.assign(httpError(prior.failureStatus || 503, prior.failureMessage), { retryAfter: prior.retryAfter });
    logEvent('INFO', 'otp.idempotency.pending', {}, req);
    throw Object.assign(httpError(409, 'Your code is still being sent. Please wait a moment and try again.'), { retryAfter: 2 });
  }
  try {
    const result = await dispatch();
    await EmailDispatch.updateOne({ _id: id }, { status: 'COMPLETE', responseEncrypted: encryptCustomerSecret(JSON.stringify(result), config, id) });
    return result;
  } catch (error) {
    await EmailDispatch.updateOne({ _id: id }, { status: 'FAILED', failureStatus: error.status || 503, failureMessage: error.status ? error.message : 'Email delivery could not be confirmed. Please wait before requesting a new code.', retryAfter: error.retryAfter });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise and validate an email address. */
function normaliseEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(422, 'Enter a valid email address.');
  return email;
}

/** Look up an active (non-expired) email challenge by its token. */
export async function activeEmailChallenge(req, token, { allowExpired = false } = {}) {
  const challenge = await EmailOtp.findOne({ tokenHash: tokenHash(token) });
  if (!challenge || challenge.status !== 'ACTIVE') throw httpError(401, 'This code is no longer valid. Please request a new code.');
  if (!allowExpired && challenge.expiresAt.getTime() <= customerNow(req)) throw httpError(401, 'Your verification code has expired. Please request a new code.');
  if (!allowExpired && challenge.attempts >= 5) throw httpError(429, 'Too many incorrect codes. Please request a new code after the cooldown.');
  return challenge;
}

// ---------------------------------------------------------------------------
// Send (or re-send) an email OTP
// ---------------------------------------------------------------------------

/**
 * Core logic shared by send and resend.
 * @param {import('express').Request} req
 * @param {{ fullName: string, email: string }} payload
 * @returns {Promise<object>} Public response (no OTP value included)
 */
export async function sendEmailOtp(req, { fullName, phone, email: rawEmail }) {
  const email = normaliseEmail(rawEmail);
  const now = customerNow(req);
  const code  = String(randomInt(1000000)).padStart(6, '0');
  const token = randomBytes(32).toString('base64url');
  const id    = new mongoose.Types.ObjectId();
  const throttleId = customerDigest(`customer-email:${email}`, req.app.locals.config);

  for (let attempt = 0; ; attempt++) {
    try {
      await mongoose.connection.transaction(async session => {
        let throttle = await EmailThrottle.findById(throttleId).session(session);
        if (!throttle) [throttle] = await EmailThrottle.create([{ _id: throttleId, windowStartedAt: new Date(now), sends: 0 }], { session });

        const remaining = EMAIL_OTP_COOLDOWN_MS - (now - (throttle.lastSentAt?.getTime() || 0));
        if (remaining > 0) throw Object.assign(httpError(429, `Please wait ${Math.ceil(remaining / 1000)} seconds before requesting another code.`), { retryAfter: Math.ceil(remaining / 1000) });

        if (now - throttle.windowStartedAt.getTime() >= 3600000) { throttle.windowStartedAt = new Date(now); throttle.sends = 0; }
        if (throttle.sends >= 6) throw Object.assign(httpError(429, 'Too many codes requested for this email address. Please try again later.'), { retryAfter: Math.ceil((throttle.windowStartedAt.getTime() + 3600000 - now) / 1000) });

        throttle.sends += 1; throttle.lastSentAt = new Date(now); throttle.expiresAt = new Date(now + 2 * 3600000);
        await throttle.save({ session });

        // Supersede any prior active OTPs for this email
        await EmailOtp.updateMany({ email, status: { $in: ['ACTIVE', 'PENDING'] } }, { status: 'SUPERSEDED' }, { session });

        await EmailOtp.create([{
          _id: id, tokenHash: tokenHash(token), email, fullName, pendingPhone: phone,
          codeHash: customerDigest(`${id}:${code}`, req.app.locals.config),
          expiresAt: new Date(now + EMAIL_OTP_EXPIRY_MS),
          purgeAt:   new Date(now + 86400000),
        }], { session });
      });
      break;
    } catch (error) {
      if (error.code === 11000 && attempt < 2) continue;
      throw error;
    }
  }

  // Deliver the email outside the transaction (network I/O)
  try {
    const source = await sendOtpEmail(req, { to: email, code });
    await EmailOtp.updateOne({ _id: id, status: 'PENDING' }, { status: 'ACTIVE', deliverySource: source });
  } catch (error) {
    await EmailOtp.updateOne({ _id: id, status: 'PENDING' }, { status: 'FAILED' });
    throw error;
  }

  return {
    challengeToken: token, email,
    expiresAt:  new Date(now + EMAIL_OTP_EXPIRY_MS).toISOString(),
    resendAt:   new Date(now + EMAIL_OTP_COOLDOWN_MS).toISOString(),
    serverTime: new Date(customerNow(req)).toISOString(),
    message:    'Your verification code has been sent to your email address.',
  };
}

// ---------------------------------------------------------------------------
// Verify an email OTP code
// ---------------------------------------------------------------------------

/**
 * Timing-safe code check. Increments the attempt counter on failure.
 * @returns {Promise<EmailOtp document>} The verified, unconsumed challenge
 */
export async function verifyEmailCode(req, token, code) {
  const challenge = await activeEmailChallenge(req, token);
  // Reserve an attempt atomically before checking the code, including concurrent requests.
  const secret = await EmailOtp.findOneAndUpdate(
    { _id: challenge._id, status: 'ACTIVE', attempts: { $lt: 5 }, expiresAt: { $gt: new Date(customerNow(req)) } },
    { $inc: { attempts: 1 } }, { new: true },
  ).select('+codeHash');
  if (!secret) {
    await activeEmailChallenge(req, token);
    throw httpError(429, 'Too many verification attempts. Please request a new code.');
  }
  if (!equals(secret.codeHash, customerDigest(`${challenge.id}:${code}`, req.app.locals.config))) {
    throw httpError(401, 'That verification code is incorrect. Please try again.');
  }
  return challenge;
}
