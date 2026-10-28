import mongoose from 'mongoose';
import { z } from 'zod';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { AdminAccount, AdminPasskey, AdminChallenge } from '../models/administration.js';
import { parse } from '../validators/commerce.js';
import { createChallenge, getChallenge, consumeChallenge, makeSession, sendStaffSession, failedLogin, staffLoginFilter } from '../services/staffAuthService.js';
import { digest, equals, decryptSecret, mfaStep } from '../services/staffCrypto.js';
import { audit, securityNow } from '../services/staffAudit.js';
import { httpError } from '../utils/httpError.js';

export async function registerPasskeyOptions(req, res, next) {
  try {
    const { code } = parse(z.object({ code: z.string().regex(/^\d{6}$/) }).strict(), req.body);
    const account = await AdminAccount.findById(req.staff._id).select('+mfaSecretEncrypted');
    const step = mfaStep(decryptSecret(account.mfaSecretEncrypted, req.app.locals.config, account.id), code, securityNow(req));
    if (step === null || step <= account.lastMfaStep) throw httpError(401, 'Use a new authenticator code to add a passkey.');
    const changed = await AdminAccount.updateOne({ _id: account._id, status: 'ACTIVE', lastMfaStep: { $lt: step } }, { lastMfaStep: step });
    if (!changed.modifiedCount) throw httpError(401, 'Authenticator code was already used.');
    const keys = await AdminPasskey.find({ accountId: account._id });
    const options = await generateRegistrationOptions({ rpName: 'SON MASALA', rpID: req.app.locals.config.webAuthnRpId, userID: new Uint8Array(Buffer.from(account.id)), userName: account.adminId, attestationType: 'none', excludeCredentials: keys.map(key => ({ id: key.credentialId, transports: key.transports })), authenticatorSelection: { residentKey: 'required', userVerification: 'required' } });
    const challenge = await createChallenge(req, { kind: 'PASSKEY_REG', realm: 'owner', accountId: account._id, sessionId: req.staffSession._id, challengeHash: digest(options.challenge) });
    res.json({ success: true, options, challengeToken: challenge.token });
  } catch (error) { next(error); }
}
export async function registerPasskeyVerify(req, res, next) {
  try {
    const { challengeToken, response } = parse(z.object({ challengeToken: z.string().max(100), response: z.record(z.unknown()) }).strict(), req.body);
    const challenge = await getChallenge(req, challengeToken, 'PASSKEY_REG', 'owner');
    if (String(challenge.accountId) !== req.staff.id || String(challenge.sessionId) !== req.staffSession.id) throw httpError(403, 'Passkey registration is not authorized.');
    const verified = await verifyRegistrationResponse({ response, expectedChallenge: value => equals(digest(value), challenge.challengeHash), expectedOrigin: req.app.locals.config.webAuthnOrigin, expectedRPID: req.app.locals.config.webAuthnRpId, requireUserVerification: true }).catch(() => null);
    if (!verified?.verified) throw httpError(401, 'Passkey registration could not be verified.');
    const { credential, credentialDeviceType, credentialBackedUp } = verified.registrationInfo;
    await mongoose.connection.transaction(async session => {
      await consumeChallenge(req, challenge, session);
      if (!await AdminAccount.exists({ _id: req.staff._id, status: 'ACTIVE', sessionVersion: req.staffSession.sessionVersion }).session(session)) throw httpError(401, 'Your session has been revoked.');
      await AdminPasskey.create([{ accountId: req.staff._id, credentialId: credential.id, publicKey: Buffer.from(credential.publicKey), counter: credential.counter, transports: credential.transports, deviceType: credentialDeviceType, backedUp: credentialBackedUp }], { session });
      await audit(req, 'OWNER_PASSKEY_REGISTERED', { targetId: req.staff.id }, session);
    });
    res.json({ success: true });
  } catch (error) { next(error.code === 11000 ? httpError(409, 'This passkey is already registered.') : error); }
}
export const passkeyLoginOptions = realm => async (req, res, next) => {
  try {
    const { adminId } = parse(z.object({ adminId: z.string().trim().toUpperCase().max(40) }).strict(), req.body);
    const account = await AdminAccount.findOne({ ...staffLoginFilter(realm, adminId), status: 'ACTIVE', mfaEnabled: true });
    if (!account || account.lockedUntil > new Date(securityNow(req))) { await audit(req, 'STAFF_PASSKEY_FAILED', { targetId: account?.id || adminId, result: 'FAILURE' }); throw httpError(401, 'Passkey sign-in is unavailable for this account.'); }
    const keys = await AdminPasskey.find({ accountId: account._id });
    if (!keys.length) { await audit(req, 'STAFF_PASSKEY_FAILED', { targetId: account.id, result: 'FAILURE' }); throw httpError(401, 'Passkey sign-in is unavailable for this account.'); }
    const options = await generateAuthenticationOptions({ rpID: req.app.locals.config.webAuthnRpId, userVerification: 'required', allowCredentials: keys.map(key => ({ id: key.credentialId, transports: key.transports })) });
    const challenge = await createChallenge(req, { kind: 'PASSKEY_AUTH', realm, accountId: account._id, challengeHash: digest(options.challenge) });
    res.json({ success: true, options, challengeToken: challenge.token });
  } catch (error) { next(error); }
};
export const passkeyLoginVerify = realm => async (req, res, next) => {
  try {
    const { challengeToken, response } = parse(z.object({ challengeToken: z.string().max(100), response: z.record(z.unknown()) }).strict(), req.body);
    const challenge = await getChallenge(req, challengeToken, 'PASSKEY_AUTH', realm);
    const account = await AdminAccount.findOne({ _id: challenge.accountId, status: 'ACTIVE', mfaEnabled: true, role: realm === 'owner' ? 'OWNER' : { $ne: 'OWNER' } });
    const key = await AdminPasskey.findOne({ accountId: challenge.accountId, credentialId: response.id });
    if (!account || !key || account.lockedUntil > new Date(securityNow(req)) || (req.app.locals.config.nodeEnv === 'production' && (!account.emailVerifiedAt || account.verificationSource === 'DEVELOPMENT_PREVIEW'))) { await AdminChallenge.updateOne({ _id: challenge._id }, { $inc: { attempts: 1 } }); await failedLogin(req, account, null, 'STAFF_PASSKEY_FAILED'); throw httpError(401, 'Passkey sign-in could not be verified.'); }
    const verified = await verifyAuthenticationResponse({ response, expectedChallenge: value => equals(digest(value), challenge.challengeHash), expectedOrigin: req.app.locals.config.webAuthnOrigin, expectedRPID: req.app.locals.config.webAuthnRpId, requireUserVerification: true, credential: { id: key.credentialId, publicKey: new Uint8Array(key.publicKey), counter: key.counter, transports: key.transports } }).catch(() => null);
    if (!verified?.verified) { await AdminChallenge.updateOne({ _id: challenge._id }, { $inc: { attempts: 1 } }); await failedLogin(req, account, null, 'STAFF_PASSKEY_FAILED'); throw httpError(401, 'Passkey sign-in could not be verified.'); }
    let result;
    await mongoose.connection.transaction(async session => {
      await consumeChallenge(req, challenge, session);
      const current = await AdminAccount.findOne({ _id: account._id, status: 'ACTIVE', mfaEnabled: true }).session(session);
      if (!current) throw httpError(401, 'Account access was revoked.');
      const updated = await AdminPasskey.updateOne({ _id: key._id, counter: key.counter }, { counter: verified.authenticationInfo.newCounter }, { session });
      if (!updated.matchedCount) throw httpError(401, 'Passkey was used concurrently. Please retry.');
      result = await makeSession(req, current, realm, 'PASSKEY', session);
    });
    sendStaffSession(req, res, result, realm);
  } catch (error) { next(error); }
};
