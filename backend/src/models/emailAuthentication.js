import mongoose from 'mongoose';
const options = { timestamps: true, autoCreate: false, autoIndex: false };

const emailOtpSchema = new mongoose.Schema({
  tokenHash:     { type: String, required: true, unique: true, select: false },
  email:         { type: String, required: true, index: true },
  fullName:      String,
  pendingPhone:  String,
  codeHash:      { type: String, required: true, select: false },
  status:        { type: String, enum: ['PENDING', 'ACTIVE', 'USED', 'SUPERSEDED', 'FAILED'], default: 'PENDING' },
  attempts:      { type: Number, default: 0 },
  deliverySource: String,
  expiresAt:     { type: Date, required: true },
  purgeAt:       { type: Date, required: true },
  usedAt:        Date,
}, options);
emailOtpSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

const emailThrottleSchema = new mongoose.Schema(
  { _id: String, windowStartedAt: Date, sends: Number, lastSentAt: Date, expiresAt: Date },
  options,
);
emailThrottleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailOtp      = mongoose.models.EmailOtp      || mongoose.model('EmailOtp',      emailOtpSchema);
export const EmailThrottle = mongoose.models.EmailThrottle || mongoose.model('EmailThrottle', emailThrottleSchema);

// A durable claim shared by every API worker. Responses contain a bearer challenge,
// so keep them encrypted and remove them after the retry window.
const emailDispatchSchema = new mongoose.Schema({
  _id: String,
  fingerprint: { type: String, required: true },
  status: { type: String, enum: ['PENDING', 'COMPLETE', 'FAILED'], required: true },
  responseEncrypted: { type: String, select: false },
  failureStatus: Number,
  failureMessage: String,
  retryAfter: Number,
  expiresAt: { type: Date, required: true },
}, options);
emailDispatchSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const EmailDispatch = mongoose.models.EmailDispatch || mongoose.model('EmailDispatch', emailDispatchSchema);

