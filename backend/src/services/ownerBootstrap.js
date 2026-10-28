import mongoose from 'mongoose';
import { AdminAccount, AdminBootstrap, AdminSession, AdminPasskey } from '../models/administration.js';
import { newAdminId, hashPassword, newMfaSecret, encryptSecret, decryptSecret, mfaStep, recoveryCodes, keyedDigest, digest, equals, totp, verifyPassword } from './staffCrypto.js';
import { audit, securityNow } from './staffAudit.js';
import { allPermissions } from '../config/permissions.js';
import { httpError } from '../utils/httpError.js';

export function verifyDeploymentProof({ expectedOsUser, actualOsUser, secretHash, suppliedSecret }) {
  if (!expectedOsUser || expectedOsUser !== actualOsUser || !/^[a-f\d]{64}$/i.test(secretHash || '') || (suppliedSecret || '').length < 32 || !equals(secretHash.toLowerCase(), digest(suppliedSecret || ''))) throw httpError(403, 'Deployment administrator verification failed.');
}
export async function beginOwnerBootstrap(req, input, proof) {
  verifyDeploymentProof(proof);
  const id = new mongoose.Types.ObjectId(), secret = newMfaSecret();
  let account;
  try {
    await mongoose.connection.transaction(async session => {
      if (await AdminBootstrap.exists({ _id: 'owner' }).session(session) || await AdminAccount.exists({ role: 'OWNER' }).session(session)) throw httpError(409, 'Owner bootstrap is already initialized. Use the documented resume or recovery process.');
      [account] = await AdminAccount.create([{ _id: id, adminId: newAdminId(true), fullName: input.fullName, email: input.email.toLowerCase(), phone: input.phone, passwordHash: await hashPassword(input.password), role: 'OWNER', permissions: allPermissions, status: 'PENDING_MFA', mfaSecretEncrypted: encryptSecret(secret, req.app.locals.config, String(id)), emailVerifiedAt: new Date(securityNow(req)), verificationSource: 'VERIFIED_DEPLOYMENT_ADMIN' }], { session });
      await AdminBootstrap.create([{ _id: 'owner', accountId: id, state: 'PENDING' }], { session });
      await audit(req, 'OWNER_BOOTSTRAP_STARTED', { actorId: id, targetId: id }, session);
    });
  } catch (error) { if (error.code === 11000) throw httpError(409, 'Owner bootstrap is already initialized.'); throw error; }
  return { account, enrollmentUri: totp(secret, account.adminId).toString() };
}
export async function resumeOwnerBootstrap(req, adminId, proof, password) {
  verifyDeploymentProof(proof);
  const account = await AdminAccount.findOne({ adminId, role: 'OWNER', status: 'PENDING_MFA' }).select('+passwordHash +mfaSecretEncrypted');
  const state = await AdminBootstrap.findOne({ _id: 'owner', accountId: account?._id, state: 'PENDING' });
  if (!account || !state || !await verifyPassword(account.passwordHash, password)) throw httpError(403, 'Pending owner enrollment could not be verified.');
  return { account, enrollmentUri: totp(decryptSecret(account.mfaSecretEncrypted, req.app.locals.config, account.id), account.adminId).toString() };
}
export async function completeOwnerBootstrap(req, accountId, code, proof) {
  verifyDeploymentProof(proof);
  const account = await AdminAccount.findById(accountId).select('+mfaSecretEncrypted');
  if (!account || account.status !== 'PENDING_MFA' || account.role !== 'OWNER') throw httpError(409, 'Owner bootstrap is not pending.');
  const step = mfaStep(decryptSecret(account.mfaSecretEncrypted, req.app.locals.config, account.id), code, securityNow(req));
  if (step === null) { await audit(req, 'OWNER_BOOTSTRAP_MFA_FAILED', { targetId: account.id, result: 'FAILURE' }); throw httpError(401, 'MFA enrollment code is invalid.'); }
  const codes = recoveryCodes();
  await mongoose.connection.transaction(async session => {
    const state = await AdminBootstrap.findOneAndUpdate({ _id: 'owner', accountId, state: 'PENDING' }, { state: 'COMPLETE', completedAt: new Date(securityNow(req)) }, { session });
    if (!state || await AdminAccount.exists({ role: 'OWNER', status: 'ACTIVE' }).session(session)) throw httpError(409, 'Owner bootstrap is already complete.');
    await AdminAccount.updateOne({ _id: accountId, status: 'PENDING_MFA' }, { status: 'ACTIVE', mfaEnabled: true, lastMfaStep: step, recoveryCodes: codes.map(code => ({ hash: keyedDigest(code, req.app.locals.config) })) }, { session });
    await audit(req, 'OWNER_BOOTSTRAP_COMPLETED', { actorId: accountId, targetId: accountId }, session);
  });
  return codes;
}
export async function recoverOwner(req, { adminId, password, recoveryCode, newSecret, code }, proof) {
  verifyDeploymentProof(proof);
  const account = await AdminAccount.findOne({ adminId, role: 'OWNER', status: 'ACTIVE' }).select('+passwordHash +recoveryCodes');
  const recoveryHash = keyedDigest(recoveryCode, req.app.locals.config);
  const recovery = account?.recoveryCodes.find(value => !value.usedAt && equals(value.hash, recoveryHash));
  if (!account || !recovery || !await verifyPassword(account.passwordHash, password)) { await audit(req, 'OWNER_RECOVERY_REJECTED', { targetId: adminId, result: 'FAILURE' }); throw httpError(403, 'Owner identity and recovery proof could not be verified.'); }
  const step = mfaStep(newSecret, code, securityNow(req));
  if (step === null) throw httpError(401, 'New MFA enrollment was not verified.');
  const codes = recoveryCodes();
  await mongoose.connection.transaction(async session => {
    const changed = await AdminAccount.updateOne({ _id: account._id, recoveryCodes: { $elemMatch: { hash: recoveryHash, usedAt: null } } }, { $set: { mfaSecretEncrypted: encryptSecret(newSecret, req.app.locals.config, account.id), lastMfaStep: step, recoveryCodes: codes.map(code => ({ hash: keyedDigest(code, req.app.locals.config) })), failedLoginAttempts: 0 }, $inc: { sessionVersion: 1 }, $unset: { lockedUntil: '' } }, { session });
    if (!changed.modifiedCount) throw httpError(403, 'Recovery proof was already used.');
    await AdminSession.updateMany({ accountId: account._id, revokedAt: null }, { revokedAt: new Date(securityNow(req)) }, { session });
    await AdminPasskey.deleteMany({ accountId: account._id }, { session });
    await audit(req, 'OWNER_MFA_RECOVERED', { actorId: account._id, targetId: account.id, changes: { sessionsRevoked: true, passkeysRevoked: true } }, session);
  });
  return codes;
}
