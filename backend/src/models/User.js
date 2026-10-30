import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  name: { type: String, required: true, alias: 'fullName' },
  email: { type: String, lowercase: true }, phone: String,
  pendingPhone: String,
  googleSubject: { type: String, select: false },
  emailVerifiedAt: Date, emailVerified: { type: Boolean, default: false }, emailVerificationSource: String,
  phoneVerifiedAt: Date, phoneVerified: { type: Boolean, default: false }, phoneVerificationSource: String,
  // Retained for existing records only; public customer password authentication is retired.
  passwordHash: { type: String, select: false },
  role: { type: String, enum: ['CUSTOMER', 'customer', 'admin'], default: 'CUSTOMER' },
  accountStatus: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'DELETED'], default: 'ACTIVE' }, lastLoginAt: Date,
}, { timestamps: true, autoCreate: false, autoIndex: false });
schema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } }, name: 'customer_verified_email_unique' });
schema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } }, name: 'customer_verified_phone_unique' });
schema.index({ googleSubject: 1 }, { unique: true, partialFilterExpression: { googleSubject: { $type: 'string' } }, name: 'customer_google_subject_unique' });
export default mongoose.models.User || mongoose.model('User', schema);
