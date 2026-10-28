import mongoose from 'mongoose';
import { z } from 'zod';
import { AdminAccount, AdminInvitation, AdminRole, AdminSession, AdminAuditLog } from '../models/administration.js';
import { operationalPermissions, permissionGroups } from '../config/permissions.js';
import { parse, objectId } from '../validators/commerce.js';
import { randomToken, digest, newAdminId } from '../services/staffCrypto.js';
import { audit, securityNow } from '../services/staffAudit.js';
import { staffView } from '../services/staffAuthService.js';
import { deliver } from '../services/authDelivery.js';
import { httpError } from '../utils/httpError.js';

const permissionInput = z.array(z.enum(operationalPermissions)).max(40).refine(values => new Set(values).size === values.length, 'Permissions must be unique');
async function resolveRole(name) { const role = await AdminRole.findOne({ name, ownerOnly: false }); if (!role) throw httpError(400, 'Choose an operational staff role.'); return role; }
export async function listAdmins(req, res, next) {
  try {
    const accounts = await AdminAccount.find({ role: { $ne: 'OWNER' } }).sort({ createdAt: -1 });
    const now = new Date(securityNow(req));
    const invitations = await AdminInvitation.find({ status: 'PENDING', expiresAt: { $gt: now } }).select('accountId expiresAt deliveryStatus createdAt').lean();
    const recentActivity = await AdminAuditLog.find({ action: { $in: ['STAFF_LOGIN_SUCCESS', 'STAFF_LOGIN_FAILED', 'STAFF_MFA_FAILED'] } }).sort({ createdAt: -1 }).limit(12).lean();
    const recentChanges = await AdminAuditLog.find({ action: { $regex: '^(ADMIN_|STAFF_SESSIONS_|ROLE_)' } }).sort({ createdAt: -1 }).limit(12).lean();
    const roles = await AdminRole.find({ ownerOnly: false }).lean();
    res.json({ success: true, admins: accounts.map(account => ({ ...staffView(account), createdAt: account.createdAt })), summary: { active: accounts.filter(value => value.status === 'ACTIVE').length, suspended: accounts.filter(value => value.status === 'SUSPENDED').length, pendingInvitations: invitations.length }, invitations, recentActivity, recentChanges, roles, permissionGroups });
  } catch (error) { next(error); }
}
export async function inviteAdmin(req, res, next) {
  try {
    const input = parse(z.object({ fullName: z.string().trim().min(2).max(100), email: z.string().trim().email().max(254), phone: z.string().regex(/^\+[1-9]\d{7,14}$/), role: z.string().max(50), permissions: permissionInput }).strict(), req.body);
    await resolveRole(input.role);
    const token = randomToken(), expiresAt = new Date(securityNow(req) + 48 * 3600000);
    let account, invitation;
    await mongoose.connection.transaction(async session => {
      const existing = await AdminAccount.findOne({ email: input.email.toLowerCase() }).session(session);
      if (existing && !['INVITED', 'REVOKED'].includes(existing.status)) throw httpError(409, 'This staff account already exists. Use its access controls.');
      if (existing?.role === 'OWNER') throw httpError(403, 'Owner accounts cannot be invited as staff.');
      if (existing) {
        account = await AdminAccount.findByIdAndUpdate(existing._id, { ...input, email: input.email.toLowerCase(), status: 'INVITED', mfaEnabled: false, $inc: { sessionVersion: 1 }, $unset: { passwordHash: '', mfaSecretEncrypted: '', recoveryCodes: '' } }, { new: true, session });
        await AdminInvitation.updateMany({ accountId: account._id, status: 'PENDING' }, { status: 'REVOKED' }, { session });
        await AdminSession.updateMany({ accountId: account._id, revokedAt: null }, { revokedAt: new Date(securityNow(req)) }, { session });
      } else [account] = await AdminAccount.create([{ ...input, adminId: newAdminId(false), email: input.email.toLowerCase(), createdBy: req.staff._id }], { session });
      [invitation] = await AdminInvitation.create([{ accountId: account._id, tokenHash: digest(token), invitedBy: req.staff._id, expiresAt, deliveryStatus: 'PENDING' }], { session });
      await audit(req, 'ADMIN_INVITED', { targetId: account.id, changes: { role: input.role, permissions: input.permissions } }, session);
    });
    const invitationUrl = `${req.app.locals.config.webAuthnOrigin}/admin/accept-invitation#token=${token}`;
    let source;
    try { source = await deliver(req, { channel: 'email', contact: account.email, subject: 'Your SON MASALA staff invitation', text: `You have been invited to SON MASALA administration. Verify your email, set your own password, and enroll MFA here: ${invitationUrl}\nThis invitation expires in 48 hours. No password is included.` }); }
    catch (error) { await AdminInvitation.updateOne({ _id: invitation._id }, { deliveryStatus: 'FAILED' }); await audit(req, 'ADMIN_INVITATION_DELIVERY_FAILED', { targetId: account.id, result: 'FAILURE' }); throw error; }
    await AdminInvitation.updateOne({ _id: invitation._id }, { deliveryStatus: source });
    res.status(201).json({ success: true, admin: staffView(account), expiresAt, deliveryStatus: source, ...(source === 'DEVELOPMENT_PREVIEW' ? { developmentInvitationUrl: invitationUrl } : {}) });
  } catch (error) { next(error.code === 11000 ? httpError(409, 'This account or invitation already exists.') : error); }
}
export async function editPermissions(req, res, next) {
  try {
    const id = parse(objectId, req.params.id); const input = parse(z.object({ role: z.string().max(50), permissions: permissionInput }).strict(), req.body); await resolveRole(input.role);
    await mongoose.connection.transaction(async session => {
      const account = await AdminAccount.findOne({ _id: id, role: { $ne: 'OWNER' } }).session(session);
      if (!account) throw httpError(404, 'Staff account not found.');
      const before = { role: account.role, permissions: [...account.permissions] };
      await AdminAccount.updateOne({ _id: id }, { ...input, $inc: { sessionVersion: 1 } }, { session });
      await AdminSession.updateMany({ accountId: id, revokedAt: null }, { revokedAt: new Date(securityNow(req)) }, { session });
      await audit(req, 'ADMIN_PERMISSIONS_CHANGED', { targetId: id, changes: { before, after: input, sessionsRevoked: true } }, session);
    });
    res.json({ success: true });
  } catch (error) { next(error); }
}
export async function editStatus(req, res, next) {
  try {
    const id = parse(objectId, req.params.id); const { status } = parse(z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED']) }).strict(), req.body);
    await mongoose.connection.transaction(async session => {
      const account = await AdminAccount.findOne({ _id: id, role: { $ne: 'OWNER' } }).session(session);
      if (!account) throw httpError(404, 'Staff account not found.');
      if (status === 'ACTIVE' && (!account.mfaEnabled || account.status !== 'SUSPENDED')) throw httpError(409, 'Only a suspended, enrolled administrator can be reactivated. Otherwise send a new invitation.');
      await AdminAccount.updateOne({ _id: id }, { status, $inc: { sessionVersion: 1 } }, { session });
      await AdminSession.updateMany({ accountId: id, revokedAt: null }, { revokedAt: new Date(securityNow(req)) }, { session });
      if (status === 'REVOKED') await AdminInvitation.updateMany({ accountId: id, status: 'PENDING' }, { status: 'REVOKED' }, { session });
      await audit(req, status === 'ACTIVE' ? 'ADMIN_REACTIVATED' : status === 'SUSPENDED' ? 'ADMIN_SUSPENDED' : 'ADMIN_ACCESS_REVOKED', { targetId: id, changes: { before: account.status, after: status } }, session);
    });
    res.json({ success: true });
  } catch (error) { next(error); }
}
export async function revokeSessions(req, res, next) {
  try {
    const id = parse(objectId, req.params.id);
    await mongoose.connection.transaction(async session => {
      if (!await AdminAccount.exists({ _id: id, role: { $ne: 'OWNER' } }).session(session)) throw httpError(404, 'Staff account not found.');
      await AdminAccount.updateOne({ _id: id }, { $inc: { sessionVersion: 1 } }, { session });
      await AdminSession.updateMany({ accountId: id, revokedAt: null }, { revokedAt: new Date(securityNow(req)) }, { session });
      await audit(req, 'STAFF_SESSIONS_REVOKED', { targetId: id }, session);
    }); res.json({ success: true });
  } catch (error) { next(error); }
}
export async function auditLogs(req, res, next) {
  try { const page = parse(z.coerce.number().int().min(1).max(10000), req.query.page || 1); const filter = req.query.targetId ? { targetId: parse(z.string().max(80), req.query.targetId) } : {}; const [logs, total] = await Promise.all([AdminAuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * 50).limit(50).lean(), AdminAuditLog.countDocuments(filter)]); res.json({ success: true, logs, page, pages: Math.ceil(total / 50) }); }
  catch (error) { next(error); }
}
