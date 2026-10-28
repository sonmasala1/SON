import { AdminAuditLog } from '../models/administration.js';
import { keyedDigest } from './staffCrypto.js';
export const securityNow = req => req.app.locals.config.clock ? req.app.locals.config.clock() : Date.now();
export function metadata(req) { return { ipHash: keyedDigest(req.ip || 'cli', req.app.locals.config), userAgent: String(req.get?.('user-agent') || 'protected-cli').slice(0, 240) }; }
export async function audit(req, action, { targetId, result = 'SUCCESS', changes, actorId } = {}, session = null) {
  const [entry] = await AdminAuditLog.create([{ actorId: actorId || req.staff?._id, targetId: targetId == null ? undefined : String(targetId), action, result, changes, sessionId: req.staffSession?._id, ...metadata(req) }], { session });
  return entry;
}
