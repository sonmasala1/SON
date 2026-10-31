import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { authenticateStaff, staffOrigin, staffCsrf, requirePermission } from '../middleware/staffAccess.js';
import { staffLogin, staffMfa, staffMe, staffLogout } from '../controllers/staffAuthController.js';
import { listAdmins, inviteAdmin, editPermissions, editStatus, revokeSessions, auditLogs } from '../controllers/ownerManagementController.js';
import { requestInvitationCode, verifyInvitationEmail, enrollInvitation, activateInvitation } from '../controllers/invitationController.js';
import { registerPasskeyOptions, registerPasskeyVerify, passkeyLoginOptions, passkeyLoginVerify } from '../controllers/passkeyController.js';
import { businessDashboard, listBusinessData, updateInventory, updateOrder, ownerSecurity, revokeOtherOwnerSessions } from '../controllers/businessController.js';
import { moderationList, moderate } from '../controllers/reviewController.js';
import {
  archiveManagedProduct, createManagedCategory, createManagedProduct, deleteManagedCategory, deleteManagedProduct,
  exportProductsCsv, importProductsCsv, listManagedCategories, listManagedProducts, updateManagedCategory, updateManagedProduct,
} from '../controllers/catalogAdminController.js';

export function staffRouter(realm) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(requireDatabase, staffOrigin);
  const attempts = rateLimit({ windowMs: 15 * 60000, max: (req) => req.app.locals.config.nodeEnv === 'test' ? 1000 : realm === 'owner' ? 10 : 20, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many authentication attempts. Please wait before trying again.' } });
  router.post('/auth/login', attempts, staffLogin(realm));
  router.post('/auth/mfa/verify', attempts, staffMfa(realm));
  router.post('/auth/passkeys/options', attempts, passkeyLoginOptions(realm));
  router.post('/auth/passkeys/verify', attempts, passkeyLoginVerify(realm));
  if (realm === 'admin') {
    router.post('/invitations/request-code', attempts, requestInvitationCode);
    router.post('/invitations/verify-email', attempts, verifyInvitationEmail);
    router.post('/invitations/enroll', attempts, enrollInvitation);
    router.post('/invitations/activate', attempts, activateInvitation);
  }
  router.use(authenticateStaff(realm === 'owner'), staffCsrf);
  router.get('/auth/me', staffMe);
  router.post('/auth/logout', staffLogout);
  router.get('/dashboard', requirePermission('dashboard.view'), businessDashboard);
  if (realm === 'owner') {
    router.get('/admins', requirePermission('owner.staff.manage'), listAdmins);
    router.post('/admins/invite', requirePermission('owner.staff.manage'), inviteAdmin);
    router.patch('/admins/:id/permissions', requirePermission('owner.permissions.manage'), editPermissions);
    router.patch('/admins/:id/status', requirePermission('owner.staff.manage'), editStatus);
    router.post('/admins/:id/revoke-sessions', requirePermission('owner.security.manage'), revokeSessions);
    router.get('/audit-logs', requirePermission('owner.access'), auditLogs);
    router.get('/security', requirePermission('owner.security.manage'), ownerSecurity);
    router.post('/security/revoke-other-sessions', requirePermission('owner.security.manage'), revokeOtherOwnerSessions);
    router.post('/auth/passkeys/register/options', attempts, requirePermission('owner.security.manage'), registerPasskeyOptions);
    router.post('/auth/passkeys/register/verify', requirePermission('owner.security.manage'), registerPasskeyVerify);
  } else {
    for (const type of ['orders', 'customers', 'inventory', 'payments', 'shipping']) router.get(`/${type}`, requirePermission(`${type}.view`), listBusinessData(type));
    router.get('/products', requirePermission('products.view'), listManagedProducts);
    router.get('/products/categories', requirePermission('products.view'), listManagedCategories);
    router.get('/products/export.csv', requirePermission('products.view'), exportProductsCsv);
    router.post('/products/import.csv', requirePermission('products.update'), importProductsCsv);
    router.post('/products', requirePermission('products.create'), createManagedProduct);
    router.patch('/products/:id', requirePermission('products.update'), updateManagedProduct);
    router.post('/products/:id/archive', requirePermission('products.update'), archiveManagedProduct);
    router.delete('/products/:id', requirePermission('products.delete'), deleteManagedProduct);
    router.post('/products/categories', requirePermission('products.create'), createManagedCategory);
    router.patch('/products/categories/:id', requirePermission('products.update'), updateManagedCategory);
    router.delete('/products/categories/:id', requirePermission('products.delete'), deleteManagedCategory);
    router.get('/analytics', requirePermission('analytics.view'), businessDashboard);
    router.patch('/inventory/:id', requirePermission('inventory.update'), updateInventory);
    router.patch('/orders/:id', requirePermission('orders.update'), updateOrder);
    router.get('/reviews', requirePermission('reviews.view'), moderationList);
    router.patch('/reviews/:id', requirePermission('reviews.moderate'), moderate);
  }
  return router;
}
