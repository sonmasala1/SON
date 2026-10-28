import mongoose from 'mongoose';
import { z } from 'zod';
import { AdminAccount, AdminInvitation } from '../models/administration.js';
import { parse } from '../validators/commerce.js';
import { digest, hashPassword, newMfaSecret, encryptSecret, decryptSecret, totp, mfaStep, recoveryCodes, keyedDigest } from '../services/staffCrypto.js';
import { sendVerification, verifyCode } from '../services/verificationService.js';
import { getChallenge, createChallenge, consumeChallenge, makeSession, sendStaffSession } from '../services/staffAuthService.js';
import { audit, securityNow } from '../services/staffAudit.js';
import { httpError } from '../utils/httpError.js';

async function invitationByToken(req, token) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) throw httpError(401, 'Invitation is invalid or expired.');
  const invitation = await AdminInvitation.findOne({ tokenHash: digest(token), status: 'PENDING', expiresAt: { $gt: new Date(securityNow(req)) } });
  const account = invitation && await AdminAccount.findOne({ _id: invitation.accountId, role: { $ne: 'OWNER' }, status: { $in: ['INVITED', 'PENDING_MFA'] } });
  if (!account) throw httpError(401, 'Invitation is invalid or expired.');
  return { account, invitation };
}
export async function requestInvitationCode(req, res, next) {
  try { const { token } = parse(z.object({ token: z.string().max(100) }).strict(), req.body); const { account, invitation } = await invitationByToken(req, token); res.set('Cache-Control', 'no-store').json({ success: true, fullName: account.fullName, ...await sendVerification(req, { kind: 'INVITE_VERIFY', accountId: account._id, invitationId: invitation._id }, account.email, 'email') }); }
  catch (error) { next(error); }
}
export async function verifyInvitationEmail(req, res, next) {
  try {
    const input = parse(z.object({ challengeToken: z.string().max(100), code: z.string().regex(/^\d{6}$/) }).strict(), req.body);
    const challenge = await verifyCode(req, input.challengeToken, input.code, 'INVITE_VERIFY');
    await mongoose.connection.transaction(session => consumeChallenge(req, challenge, session));
    const enrollment = await createChallenge(req, { kind: 'INVITE_VERIFIED', accountId: challenge.accountId, invitationId: challenge.invitationId, deliverySource: challenge.deliverySource }, 10);
    res.json({ success: true, verificationToken: enrollment.token });
  } catch (error) { next(error); }
}
const passwordSchema = z.string().min(12).max(128).refine(value => Buffer.byteLength(value) <= 128, 'Password is too long');
export async function enrollInvitation(req, res, next) {
  try {
    const input = parse(z.object({ verificationToken: z.string().max(100), password: passwordSchema }).strict(), req.body);
    const challenge = await getChallenge(req, input.verificationToken, 'INVITE_VERIFIED');
    const account = await AdminAccount.findOne({ _id: challenge.accountId, role: { $ne: 'OWNER' }, status: { $in: ['INVITED', 'PENDING_MFA'] } });
    const invitation = await AdminInvitation.findOne({ _id: challenge.invitationId, status: 'PENDING', expiresAt: { $gt: new Date(securityNow(req)) } });
    if (!account || !invitation) throw httpError(401, 'Invitation is no longer available.');
    const secret = newMfaSecret(), passwordHash = await hashPassword(input.password);
    await mongoose.connection.transaction(async session => {
      await consumeChallenge(req, challenge, session);
      await AdminAccount.updateOne({ _id: account._id, status: { $in: ['INVITED', 'PENDING_MFA'] } }, { passwordHash, mfaSecretEncrypted: encryptSecret(secret, req.app.locals.config, account.id), status: 'PENDING_MFA' }, { session });
    });
    const enrollment = await createChallenge(req, { kind: 'INVITE_ENROLL', accountId: account._id, invitationId: invitation._id, deliverySource: challenge.deliverySource }, 10);
    res.set('Cache-Control', 'no-store').json({ success: true, enrollmentToken: enrollment.token, adminId: account.adminId, enrollmentUri: totp(secret, account.adminId).toString(), secret });
  } catch (error) { next(error); }
}
export async function activateInvitation(req, res, next) {
  try {
    const input = parse(z.object({ enrollmentToken: z.string().max(100), code: z.string().regex(/^\d{6}$/) }).strict(), req.body);
    const challenge = await getChallenge(req, input.enrollmentToken, 'INVITE_ENROLL');
    const account = await AdminAccount.findOne({ _id: challenge.accountId, role: { $ne: 'OWNER' }, status: 'PENDING_MFA' }).select('+mfaSecretEncrypted');
    const step = account ? mfaStep(decryptSecret(account.mfaSecretEncrypted, req.app.locals.config, account.id), input.code, securityNow(req)) : null;
    if (step === null) { await challenge.updateOne({ $inc: { attempts: 1 } }); throw httpError(401, 'Authenticator code could not be verified.'); }
    const codes = recoveryCodes(); let result;
    await mongoose.connection.transaction(async session => {
      await consumeChallenge(req, challenge, session);
      const invitation = await AdminInvitation.findOneAndUpdate({ _id: challenge.invitationId, status: 'PENDING', expiresAt: { $gt: new Date(securityNow(req)) } }, { status: 'ACCEPTED', acceptedAt: new Date(securityNow(req)) }, { session });
      if (!invitation) throw httpError(401, 'Invitation was revoked or expired.');
      const activated = await AdminAccount.findOneAndUpdate({ _id: account._id, role: { $ne: 'OWNER' }, status: 'PENDING_MFA' }, { status: 'ACTIVE', mfaEnabled: true, lastMfaStep: step, emailVerifiedAt: challenge.deliverySource === 'DEVELOPMENT_PREVIEW' ? null : new Date(securityNow(req)), verificationSource: challenge.deliverySource, recoveryCodes: codes.map(code => ({ hash: keyedDigest(code, req.app.locals.config) })) }, { new: true, session });
      if (!activated) throw httpError(401, 'Account activation is no longer available.');
      result = await makeSession(req, activated, 'admin', 'TOTP', session);
      await audit(req, 'ADMIN_INVITATION_ACCEPTED', { actorId: activated._id, targetId: activated.id, changes: { invitedBy: invitation.invitedBy } }, session);
    });
    sendStaffSession(req, res, result, 'admin', { recoveryCodes: codes });
  } catch (error) { next(error); }
}
