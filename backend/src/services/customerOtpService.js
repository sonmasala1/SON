import mongoose from 'mongoose';
import { randomBytes, randomInt } from 'node:crypto';
import { CustomerOtp, CustomerAuthThrottle } from '../models/customerAuthentication.js';
import { keyedDigest, equals } from './staffCrypto.js';
import { customerNow, tokenHash } from './customerSessionService.js';
import { deliver } from './authDelivery.js';
import { httpError } from '../utils/httpError.js';

export const OTP_EXPIRY_MS = 5 * 60000;
export const OTP_COOLDOWN_MS = 60000;
export async function activeCustomerChallenge(req, token, { allowExpired = false } = {}) {
  const challenge = await CustomerOtp.findOne({ tokenHash: tokenHash(token) });
  if (!challenge || !['ACTIVE'].includes(challenge.status)) throw httpError(401, 'This code is no longer valid. Please request a new code.');
  if (!allowExpired && challenge.expiresAt.getTime() <= customerNow(req)) throw httpError(401, 'Your verification code has expired. Please request a new code.');
  if (!allowExpired && challenge.attempts >= 5) throw httpError(429, 'Too many incorrect codes. Please request a new code after the cooldown.');
  return challenge;
}
export async function sendCustomerOtp(req, { fullName, phone, channel }) {
  const now = customerNow(req), code = String(randomInt(1000000)).padStart(6, '0'), token = randomBytes(32).toString('base64url'), id = new mongoose.Types.ObjectId();
  const throttleId = keyedDigest(`customer-mobile:${phone}`, req.app.locals.config);
  // The per-number bucket and challenge are written in one transaction, across API processes.
  for (let attempt = 0; ; attempt++) {
    try {
      await mongoose.connection.transaction(async session => {
        let throttle = await CustomerAuthThrottle.findById(throttleId).session(session);
        if (!throttle) [throttle] = await CustomerAuthThrottle.create([{ _id: throttleId, windowStartedAt: new Date(now), sends: 0 }], { session });
        const remaining = OTP_COOLDOWN_MS - (now - (throttle.lastSentAt?.getTime() || 0));
        if (remaining > 0) throw Object.assign(httpError(429, `Please wait ${Math.ceil(remaining / 1000)} seconds before requesting another code.`), { retryAfter: Math.ceil(remaining / 1000) });
        if (now - throttle.windowStartedAt.getTime() >= 3600000) { throttle.windowStartedAt = new Date(now); throttle.sends = 0; }
        if (throttle.sends >= 6) throw Object.assign(httpError(429, 'Too many codes requested for this mobile number. Please try again later.'), { retryAfter: Math.ceil((throttle.windowStartedAt.getTime() + 3600000 - now) / 1000) });
        throttle.sends += 1; throttle.lastSentAt = new Date(now); throttle.expiresAt = new Date(now + 2 * 3600000); await throttle.save({ session });
        await CustomerOtp.updateMany({ phone, status: { $in: ['ACTIVE', 'PENDING'] } }, { status: 'SUPERSEDED' }, { session });
        await CustomerOtp.create([{ _id: id, tokenHash: tokenHash(token), phone, fullName, channel, codeHash: keyedDigest(`${id}:${code}`, req.app.locals.config), expiresAt: new Date(now + OTP_EXPIRY_MS), purgeAt: new Date(now + 86400000) }], { session });
      });
      break;
    } catch (error) { if (error.code === 11000 && attempt < 2) continue; throw error; }
  }
  try {
    const source = await deliver(req, { channel, contact: phone, subject: 'Your SON MASALA verification code', text: `Your SON MASALA verification code is ${code}. It expires in 5 minutes. Do not share this code.`, authenticationCode: code });
    const updated = await CustomerOtp.updateOne({ _id: id, status: 'PENDING' }, { status: 'ACTIVE', deliverySource: source });
    if (!updated.modifiedCount) throw httpError(409, 'A newer code was requested. Please use the latest verification request.');
    return { challengeToken: token, phone, channel, expiresAt: new Date(now + OTP_EXPIRY_MS).toISOString(), resendAt: new Date(now + OTP_COOLDOWN_MS).toISOString(), serverTime: new Date(customerNow(req)).toISOString(), message: source === 'DEVELOPMENT_PREVIEW' ? 'Local development preview only. No message was sent.' : 'Your verification code has been accepted for sending.', ...(source === 'DEVELOPMENT_PREVIEW' ? { developmentCode: code } : {}) };
  } catch (error) { await CustomerOtp.updateOne({ _id: id, status: 'PENDING' }, { status: 'FAILED' }); throw error; }
}
export async function verifyCustomerCode(req, token, code) {
  const challenge = await activeCustomerChallenge(req, token);
  const secret = await CustomerOtp.findById(challenge._id).select('+codeHash');
  if (!equals(secret.codeHash, keyedDigest(`${challenge.id}:${code}`, req.app.locals.config))) {
    await CustomerOtp.updateOne({ _id: challenge._id, status: 'ACTIVE' }, { $inc: { attempts: 1 } });
    throw httpError(401, 'That verification code is incorrect. Please try again.');
  }
  if (req.app.locals.config.nodeEnv === 'production' && challenge.deliverySource === 'DEVELOPMENT_PREVIEW') throw httpError(401, 'Please request a new verification code.');
  return challenge;
}
