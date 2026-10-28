import mongoose from 'mongoose';
const schema = new mongoose.Schema({ orderId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Order', index: true }, variantId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'ProductVariant' }, quantity: { type: Number, required: true }, status: { type: String, enum: ['HELD', 'CONSUMED', 'RELEASED'], default: 'HELD', index: true }, expiresAt: { type: Date, required: true, index: true } }, { timestamps: true, autoCreate: false, autoIndex: false, collection: 'inventoryReservations' });
schema.index({ orderId: 1, variantId: 1 }, { unique: true });
export default mongoose.models.InventoryReservation || mongoose.model('InventoryReservation', schema);
