import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', required: true, index: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminAccount', required: true, index: true },
  quantityBefore: { type: Number, required: true, min: 0 },
  quantityAfter: { type: Number, required: true, min: 0 },
  quantityDelta: { type: Number, required: true },
  reason: { type: String, enum: ['ADMIN_ADJUSTMENT', 'ORDER_DEDUCTION', 'ORDER_RESTOCK'], required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
}, { timestamps: true, autoCreate: false, autoIndex: false, collection: 'stockMovements' });

export default mongoose.models.StockMovement || mongoose.model('StockMovement', schema);
