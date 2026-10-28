import { z } from 'zod';
import { parse } from '../validators/commerce.js';
import { beginStaffLogin, verifyStaffMfa, staffView, sendStaffSession } from '../services/staffAuthService.js';
import { AdminSession } from '../models/administration.js';
import { audit, securityNow } from '../services/staffAudit.js';
import { staffCookie } from '../middleware/staffAccess.js';

export const staffLogin = realm => async (req, res, next) => {
  try { const input = parse(z.object({ adminId: z.string().trim().toUpperCase().max(40), password: z.string().min(1).max(200) }).strict(), req.body); res.set('Cache-Control', 'no-store').json({ success: true, ...await beginStaffLogin(req, realm, input.adminId, input.password) }); }
  catch (error) { next(error); }
};
export const staffMfa = realm => async (req, res, next) => {
  try { const input = parse(z.object({ challengeToken: z.string().max(100), code: z.string().regex(/^(?:\d{6}|[A-F0-9]{4}(?:-[A-F0-9]{4}){7})$/) }).strict(), req.body); sendStaffSession(req, res, await verifyStaffMfa(req, realm, input.challengeToken, input.code), realm); }
  catch (error) { next(error); }
};
export function staffMe(req, res) { res.json({ success: true, account: staffView(req.staff), csrfToken: req.csrfToken, session: { expiresAt: req.staffSession.expiresAt, mfaMethod: req.staffSession.mfaMethod } }); }
export async function staffLogout(req, res, next) {
  try { await AdminSession.updateOne({ _id: req.staffSession._id }, { revokedAt: new Date(securityNow(req)) }); await audit(req, 'STAFF_LOGOUT', { targetId: req.staff.id }); res.clearCookie(`son_${req.staffRealm}_session`, staffCookie(req, req.staffRealm, true)); res.json({ success: true }); }
  catch (error) { next(error); }
}
