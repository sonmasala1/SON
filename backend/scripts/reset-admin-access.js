import mongoose from 'mongoose';
import { getEnv } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { AdminAccount } from '../src/models/administration.js';
import { hashPassword } from '../src/services/staffCrypto.js';

const adminId = (process.env.SON_ADMIN_ID || '').trim();
const newPassword = process.env.SON_ADMIN_NEW_PASSWORD || '';
const unlockOnly = process.argv.includes('--unlock-only');

if (!adminId) throw new Error('Set SON_ADMIN_ID to the existing account login ID.');
if (!unlockOnly && newPassword.length < 12) throw new Error('Set SON_ADMIN_NEW_PASSWORD to a strong password of at least 12 characters.');

const env = getEnv();
await connectDatabase(env.MONGODB_URI, env.MONGODB_DB_NAME);

try {
  const account = await AdminAccount.findOne({
    role: { $ne: 'OWNER' },
    status: { $in: ['ACTIVE', 'SUSPENDED', 'REVOKED', 'PENDING_MFA'] },
    $or: [{ adminId }, { loginId: adminId }],
  }).select('+passwordHash');

  if (!account) throw new Error('No existing non-owner administrator matches SON_ADMIN_ID. No account was created.');

  const update = {
    $set: { failedLoginAttempts: 0 },
    $unset: { lockedUntil: '' },
  };
  if (!unlockOnly) update.$set.passwordHash = await hashPassword(newPassword);

  await AdminAccount.updateOne({ _id: account._id }, update);
  console.log(`Updated admin access for existing account ${account.adminId}. Password ${unlockOnly ? 'was preserved' : 'was replaced with an Argon2id hash'}. MFA enrollment was preserved.`);
} finally {
  await disconnectDatabase();
}
