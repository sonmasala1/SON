import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  publicId: { type: String, required: true, unique: true },
  ownerKey: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  cartId: { type: mongoose.Schema.Types.ObjectId, required: true },
  cartVersion: Number,
  requestKey: { type: String, required: true },
  paymentMode: { type: String, enum: ['DEMO', 'PAY_LATER'], required: true },
  paymentStatus: { type: String, enum: ['PENDING', 'PAID', 'PAID_DEMO', 'FAILED', 'CANCELLED', 'REFUND_PENDING'], default: 'PENDING' },
  fulfillmentStatus: { type: String, enum: ['PLACED', 'CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'NEW'], default: 'PLACED' },
  isDemo: { type: Boolean, default: false, immutable: true },
  items: [{ productId: mongoose.Schema.Types.ObjectId, variantId: mongoose.Schema.Types.ObjectId, name: String, hindiName: String, label: String, sku: String, image: String, imageCrop: String, quantity: Number, unitPricePaise: Number, lineTotalPaise: Number }],
  totals: { subtotalPaise: Number, discountPaise: Number, deliveryPaise: Number, totalPaise: Number },
  delivery: { fullName: String, email: String, phone: String, address: String, city: String, state: String, pincode: String },
  expiresAt: { type: Date, required: false, index: true },
}, { timestamps: true, autoCreate: false, autoIndex: false });
schema.index({ ownerKey: 1, requestKey: 1 }, { unique: true });
export default mongoose.models.Order || mongoose.model('Order', schema);
