import mongoose from 'mongoose';
const options = { timestamps: true, autoCreate: false, autoIndex: false };
const ref = { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAccount' };
const accountSchema = new mongoose.Schema({
  adminId: { type: String, required: true, unique: true },
  loginId: { type: String, uppercase: true, trim: true }, fullName: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, unique: true }, phone: String,
  passwordHash: { type: String, select: false }, role: { type: String, required: true }, permissions: [String],
  status: { type: String, enum: ['INVITED', 'PENDING_MFA', 'ACTIVE', 'SUSPENDED', 'REVOKED'], default: 'INVITED', index: true },
  emailVerifiedAt: Date, verificationSource: String, mfaEnabled: { type: Boolean, default: false },
  mfaSecretEncrypted: { type: String, select: false }, recoveryCodes: { type: [{ hash: String, usedAt: Date }], select: false },
  lastMfaStep: { type: Number, default: -1 }, lastLoginAt: Date, createdBy: ref,
  sessionVersion: { type: Number, default: 0 }, failedLoginAttempts: { type: Number, default: 0 }, lockedUntil: Date,
}, options);
accountSchema.index({ role: 1 }, { unique: true, partialFilterExpression: { role: 'OWNER', status: 'ACTIVE' }, name: 'one_active_owner' });
const invitationSchema = new mongoose.Schema({ accountId: { ...ref, required: true }, tokenHash: { type: String, required: true, unique: true }, invitedBy: { ...ref, required: true }, expiresAt: { type: Date, required: true }, status: { type: String, enum: ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'], default: 'PENDING' }, deliveryStatus: String, acceptedAt: Date }, options);
invitationSchema.index({ accountId: 1, status: 1 });
const sessionSchema = new mongoose.Schema({ accountId: { ...ref, required: true, index: true }, tokenHash: { type: String, required: true, unique: true, select: false }, realm: { type: String, enum: ['owner', 'admin'], required: true }, sessionVersion: { type: Number, required: true }, mfaMethod: String, expiresAt: { type: Date, required: true }, lastSeenAt: Date, revokedAt: Date, ipHash: String, userAgent: String }, options);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const roleSchema = new mongoose.Schema({ name: { type: String, required: true, unique: true }, label: String, permissions: [String], ownerOnly: { type: Boolean, default: false } }, options);
const permissionSchema = new mongoose.Schema({ key: { type: String, required: true, unique: true }, group: String, ownerOnly: Boolean }, options);
const auditSchema = new mongoose.Schema({ actorId: ref, targetId: String, action: { type: String, required: true }, result: { type: String, enum: ['SUCCESS', 'FAILURE'], required: true }, changes: mongoose.Schema.Types.Mixed, sessionId: mongoose.Schema.Types.ObjectId, ipHash: String, userAgent: String }, options);
auditSchema.index({ createdAt: -1 }); auditSchema.index({ targetId: 1, createdAt: -1 });
auditSchema.pre('save', function () { if (!this.isNew) throw new Error('Audit records are append-only'); });
for (const event of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete']) auditSchema.pre(event, function () { throw new Error('Audit records are append-only'); });
const challengeSchema = new mongoose.Schema({ tokenHash: { type: String, required: true, unique: true }, accountId: ref, invitationId: mongoose.Schema.Types.ObjectId, sessionId: mongoose.Schema.Types.ObjectId, kind: String, realm: String, expiresAt: { type: Date, required: true }, usedAt: Date, attempts: { type: Number, default: 0 }, codeHash: String, challengeHash: String, encryptedEnrollment: { type: String, select: false }, contact: String, channel: String, deliverySource: String }, options);
challengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const bootstrapSchema = new mongoose.Schema({ _id: String, accountId: ref, state: { type: String, enum: ['PENDING', 'COMPLETE'], required: true }, completedAt: Date }, options);
const passkeySchema = new mongoose.Schema({ accountId: { ...ref, required: true, index: true }, credentialId: { type: String, required: true, unique: true }, publicKey: { type: Buffer, required: true }, counter: { type: Number, required: true }, transports: [String], deviceType: String, backedUp: Boolean, label: String }, options);
const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);
export const AdminAccount = model('AdminAccount', accountSchema);
export const AdminInvitation = model('AdminInvitation', invitationSchema);
export const AdminSession = model('AdminSession', sessionSchema);
export const AdminRole = model('AdminRole', roleSchema);
export const AdminPermission = model('AdminPermission', permissionSchema);
export const AdminAuditLog = model('AdminAuditLog', auditSchema);
export const AdminChallenge = model('AdminChallenge', challengeSchema);
export const AdminBootstrap = model('AdminBootstrap', bootstrapSchema);
export const AdminPasskey = model('AdminPasskey', passkeySchema);
export const administrationModels = [AdminAccount, AdminInvitation, AdminSession, AdminRole, AdminPermission, AdminAuditLog, AdminChallenge, AdminBootstrap, AdminPasskey];
