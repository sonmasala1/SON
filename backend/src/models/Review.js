import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  displayName: { type: String, required: true, maxlength: 60 },
  rating: { type: Number, min: 1, max: 5, required: true, validate: Number.isInteger },
  comment: { type: String, required: true, minlength: 10, maxlength: 1500 },
  approved: { type: Boolean, default: false },
  verifiedPurchase: { type: Boolean, default: false },
  // Optional for historical records. API context does not prove a browser visit.
  submission: {
    type: new mongoose.Schema({
      channel: { type: String, enum: ['customer-api'] },
      environment: { type: String, enum: ['development', 'test', 'production'] },
      requestId: { type: String, maxlength: 36 },
      origin: { type: String, maxlength: 300 },
      verificationSource: { type: String, maxlength: 60 },
    }, { _id: false }),
    immutable: true,
  },
}, { timestamps: true, autoCreate: false, autoIndex: false });
schema.index({ productId: 1, userId: 1 }, { unique: true });
schema.index({ approved: 1, createdAt: -1 });
export default mongoose.models.Review || mongoose.model('Review', schema);
