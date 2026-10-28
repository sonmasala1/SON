import mongoose from 'mongoose';
const options = { timestamps: true, autoCreate: false, autoIndex: false };
const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  verificationSource: String, lastSeenAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true }, absoluteExpiresAt: { type: Date, required: true },
  revokedAt: Date, userAgent: String,
}, options);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const otpSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, select: false },
  phone: { type: String, required: true, index: true }, fullName: { type: String, required: true },
  channel: { type: String, enum: ['sms', 'whatsapp'], required: true },
  codeHash: { type: String, required: true, select: false },
  status: { type: String, enum: ['PENDING', 'ACTIVE', 'USED', 'SUPERSEDED', 'FAILED'], default: 'PENDING' },
  attempts: { type: Number, default: 0 }, deliverySource: String,
  expiresAt: { type: Date, required: true }, purgeAt: { type: Date, required: true }, usedAt: Date,
}, options);
otpSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
const throttleSchema = new mongoose.Schema({ _id: String, windowStartedAt: Date, sends: Number, lastSentAt: Date, expiresAt: Date }, options);
throttleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const CustomerSession = mongoose.models.CustomerSession || mongoose.model('CustomerSession', sessionSchema);
export const CustomerOtp = mongoose.models.CustomerOtp || mongoose.model('CustomerOtp', otpSchema);
export const CustomerAuthThrottle = mongoose.models.CustomerAuthThrottle || mongoose.model('CustomerAuthThrottle', throttleSchema);
