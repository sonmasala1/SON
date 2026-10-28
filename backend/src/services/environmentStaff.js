import mongoose from 'mongoose';
import { z } from 'zod';
import { AdminAccount, AdminBootstrap, AdminSession } from '../models/administration.js';
import { allPermissions, operationalPermissions } from '../config/permissions.js';
import { hashPassword, verifyPassword, encryptSecret, decryptSecret, digest } from './staffCrypto.js';
import { audit } from './staffAudit.js';

const credentials = z.object({
  adminId: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/),
  password: z.string().min(8).max(128),
  secret: z.string().trim().toUpperCase().regex(/^[A-Z2-7]{16,128}$/),
  fullName: z.string().trim().min(2).max(100),
  email: z.string().email().max(254),
  role: z.enum(['OWNER', 'ADMIN']),
});

export function environmentStaff(env) {
  if ((env.NODE_ENV || 'development') === 'production') throw new Error('Environment staff setup is available for local development. Use owner bootstrap and staff invitations in production.');
  const entries = ['OWNER', 'ADMIN'].map(role => {
    const input = {
      adminId: env[role === 'OWNER' ? 'OWNER_USER_ID' : 'ADMIN_ID'],
      password: env[`${role}_PASSWORD`], secret: env[`${role}_MFA_SECRET`],
      fullName: env[`${role}_NAME`] || (role === 'OWNER' ? 'Store Owner' : 'Store Administrator'),
      email: env[`${role}_EMAIL`] || `${role.toLowerCase()}@staff.sonmasala.invalid`, role,
    };
    const result = credentials.safeParse(input);
    if (!result.success) throw new Error(`${role} environment credentials are invalid: ${result.error.issues.map(issue => issue.path.join('.')).join(', ')}. MFA secrets must be Base32 setup keys; passwords must contain at least 8 characters.`);
    return { ...result.data, loginId: result.data.adminId };
  });
  if (entries[0].email.toLowerCase() === entries[1].email.toLowerCase()) throw new Error('Owner and administrator must use different emails.');
  if (entries[0].adminId === entries[1].adminId) {
    for (const entry of entries) entry.adminId = `${entry.role === 'OWNER' ? 'OWN' : 'ADM'}-ENV-${digest(entry.loginId).slice(0, 16).toUpperCase()}`;
  }
  return entries;
}

// Trusted local CLI only. Passwords and setup keys never become REST configuration.
export async function syncEnvironmentStaff(req, entries) {
  if (req.app.locals.config.nodeEnv === 'production') throw new Error('Environment staff setup is disabled in production.');
  const result = [];
  await mongoose.connection.transaction(async session => {
    result.length = 0;
    for (const input of entries) {
      if (input.role === 'OWNER' && await AdminAccount.exists({ role: 'OWNER', adminId: { $ne: input.adminId } }).session(session)) throw new Error('A different owner already exists. Environment setup cannot replace it.');
      let account = await AdminAccount.findOne({ adminId: input.adminId }).select('+passwordHash +mfaSecretEncrypted').session(session);
      if (account && (account.role !== input.role || account.verificationSource !== 'ENVIRONMENT_CONFIG' || account.status !== 'ACTIVE')) throw new Error('An existing account cannot be replaced or reactivated through environment setup.');
      const created = !account;
      const passwordChanged = !account || !await verifyPassword(account.passwordHash, input.password);
      const mfaChanged = !account || decryptSecret(account.mfaSecretEncrypted, req.app.locals.config, account.id) !== input.secret;
      if (!account) account = new AdminAccount({ adminId: input.adminId, loginId: input.loginId, fullName: input.fullName, email: input.email, role: input.role, permissions: input.role === 'OWNER' ? allPermissions : operationalPermissions, status: 'ACTIVE', mfaEnabled: true, verificationSource: 'ENVIRONMENT_CONFIG' });
      if (passwordChanged) account.passwordHash = await hashPassword(input.password);
      if (mfaChanged) { account.mfaSecretEncrypted = encryptSecret(input.secret, req.app.locals.config, account.id); account.lastMfaStep = -1; account.recoveryCodes = []; }
      if (!created && (passwordChanged || mfaChanged)) {
        account.sessionVersion += 1; account.failedLoginAttempts = 0; account.lockedUntil = undefined;
        await AdminSession.updateMany({ accountId: account._id, revokedAt: null }, { revokedAt: new Date() }, { session });
      }
      if (created || passwordChanged || mfaChanged) {
        await account.save({ session });
        await audit(req, created ? 'ENV_STAFF_ACCOUNT_CREATED' : 'ENV_STAFF_CREDENTIALS_UPDATED', { actorId: account._id, targetId: account.id, changes: { role: account.role } }, session);
      }
      if (input.role === 'OWNER') {
        const state = await AdminBootstrap.findById('owner').session(session);
        if (state && String(state.accountId) !== account.id) throw new Error('Owner bootstrap belongs to another account.');
        if (!state) await AdminBootstrap.create([{ _id: 'owner', accountId: account._id, state: 'COMPLETE', completedAt: new Date() }], { session });
      }
      result.push({ role: input.role, created, credentialsUpdated: passwordChanged || mfaChanged });
    }
  });
  return result;
}
