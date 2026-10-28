import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  stateHash: { type: String, required: true, unique: true, select: false },
  browserHash: { type: String, required: true, select: false },
  nonceHash: { type: String, required: true, select: false },
  verifierEncrypted: { type: String, required: true, select: false },
  returnTo: { type: String, required: true },
  expiresAt: { type: Date, required: true }, usedAt: Date,
}, { timestamps: true, autoCreate: false, autoIndex: false });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.models.GoogleLoginAttempt || mongoose.model('GoogleLoginAttempt', schema);
