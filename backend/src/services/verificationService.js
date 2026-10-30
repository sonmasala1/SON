import { randomInt } from 'node:crypto';
import { createChallenge, getChallenge } from './staffAuthService.js';
import { keyedDigest, equals } from './staffCrypto.js';
import { AdminChallenge } from '../models/administration.js';
import { deliver } from './authDelivery.js';
import { httpError } from '../utils/httpError.js';
import { securityNow } from './staffAudit.js';

export async function sendVerification(req, fields, contact, channel) {
  if (await AdminChallenge.exists({ kind: fields.kind, contact, createdAt: { $gt: new Date(securityNow(req) - 60000) } })) throw httpError(429, 'Please wait one minute before requesting another verification code.');
  const { token, challenge } = await createChallenge(req, { ...fields, contact, channel });
  const code = String(randomInt(1000000)).padStart(6, '0');
  await AdminChallenge.updateOne({ _id: challenge._id }, { codeHash: keyedDigest(`${challenge.id}:${code}`, req.app.locals.config) });
  try {
    const source = await deliver(req, { channel, contact, subject: 'Your SON MASALA verification code', authenticationCode: code, text: `Your SON MASALA verification code is ${code}. It expires in 5 minutes. Do not share this code.` });
    await AdminChallenge.updateOne({ _id: challenge._id }, { deliverySource: source });
    return { challengeToken: token, message: source === 'DEVELOPMENT_PREVIEW' ? 'Development preview only. No message was sent.' : 'A verification code has been sent.', ...(source === 'DEVELOPMENT_PREVIEW' ? { developmentCode: code } : {}) };
  } catch (error) { await AdminChallenge.deleteOne({ _id: challenge._id }); throw error; }
}
export async function verifyCode(req, token, code, kind) {
  const challenge = await getChallenge(req, token, kind);
  if (!equals(challenge.codeHash, keyedDigest(`${challenge.id}:${code}`, req.app.locals.config))) {
    await AdminChallenge.updateOne({ _id: challenge._id }, { $inc: { attempts: 1 } });
    throw httpError(401, 'Verification code is invalid or expired.');
  }
  return challenge;
}
