import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  displayName: { type: String, required: true, maxlength: 60 },
  rating: { type: Number, min: 1, max: 5, required: true, validate: Number.isInteger },
  comment: { type: String, required: true, minlength: 10, maxlength: 1500 },
  approved: { type: Boolean, default: false },
  verifiedPurchase: { type: Boolean, default: false },
}, { timestamps: true, autoCreate: false, autoIndex: false });
schema.index({ productId: 1, userId: 1 }, { unique: true });
schema.index({ approved: 1, createdAt: -1 });
export default mongoose.models.Review || mongoose.model('Review', schema);
