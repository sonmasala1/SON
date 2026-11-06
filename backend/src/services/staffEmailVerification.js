import mongoose from 'mongoose';
import { z } from 'zod';
import { AdminAccount, AdminSession } from '../models/administration.js';
import { sendVerification, verifyCode } from './verificationService.js';
import { consumeChallenge } from './staffAuthService.js';
import { audit, securityNow } from './staffAudit.js';
import { httpError } from '../utils/httpError.js';

export const STAFF_EMAIL_CHALLENGE = 'STAFF_EMAIL_VERIFY';
export const OPERATOR_EMAIL_SOURCE = 'OPERATOR_EMAIL_OTP';

const loginIdSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/);
// Reserved, non-deliverable domains can never prove mailbox ownership.
const emailSchema = z.string().trim().toLowerCase().email().max(254)
  .refine(value => !/\.(?:invalid|test|example|localhost)$/.test(value) && !/@(?:[^@]+\.)?example\.(?:com|org|net)$/.test(value), 'Use a real, deliverable email address.');

export async function findStaffAccount(loginId) {
  const id = loginIdSchema.parse(loginId);
  const account = await AdminAccount.findOne({ $or: [{ adminId: id }, { loginId: id }] });
  if (!account) throw httpError(404, 'No staff account matches that ID. No account was created.');
  return account;
}

// Sends a one-time code to the address that will become the account's verified email.
export async function beginStaffEmailVerification(req, { loginId, email }) {
  const account = await findStaffAccount(loginId);
  if (account.status !== 'ACTIVE') throw httpError(409, 'Only active staff accounts can be verified. Reactivate the account through the owner workspace first.');
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) throw httpError(400, 'Use a real, deliverable email address.');
  if (await AdminAccount.exists({ email: parsed.data, _id: { $ne: account._id } })) throw httpError(409, 'Another staff account already uses that email address.');
  const result = await sendVerification(req, { kind: STAFF_EMAIL_CHALLENGE, accountId: account._id }, parsed.data, 'email');
  return { ...result, account };
}

// Marks the email verified only after the emailed code is proven. Existing sessions are revoked.
export async function completeStaffEmailVerification(req, challengeToken, code) {
  if (!/^\d{6}$/.test(code || '')) throw httpError(400, 'Enter the six-digit code from the email.');
  const challenge = await verifyCode(req, challengeToken, code, STAFF_EMAIL_CHALLENGE);
  if (challenge.deliverySource === 'DEVELOPMENT_PREVIEW' || !challenge.deliverySource) throw httpError(409, 'A development preview code cannot verify a staff email. Configure real email delivery and try again.');
  let account;
  await mongoose.connection.transaction(async session => {
    await consumeChallenge(req, challenge, session);
    if (await AdminAccount.exists({ email: challenge.contact, _id: { $ne: challenge.accountId } }).session(session)) throw httpError(409, 'Another staff account already uses that email address.');
    account = await AdminAccount.findOneAndUpdate(
      { _id: challenge.accountId, status: 'ACTIVE' },
      { $set: { email: challenge.contact, emailVerifiedAt: new Date(securityNow(req)), verificationSource: OPERATOR_EMAIL_SOURCE }, $inc: { sessionVersion: 1 } },
      { new: true, session },
    );
    if (!account) throw httpError(409, 'The staff account is no longer active.');
    await AdminSession.updateMany({ accountId: account._id, revokedAt: null }, { revokedAt: new Date(securityNow(req)) }, { session });
    await audit(req, 'STAFF_EMAIL_VERIFIED', { actorId: account._id, targetId: account.id, changes: { source: OPERATOR_EMAIL_SOURCE, delivery: challenge.deliverySource } }, session);
  });
  return account;
}
