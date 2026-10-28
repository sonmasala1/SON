import mongoose from 'mongoose';
const line = new mongoose.Schema({ productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true }, variantId: { type: mongoose.Schema.Types.ObjectId, required: true }, quantity: { type: Number, min: 1, max: 99, validate: Number.isInteger, required: true } });
const schema = new mongoose.Schema({ ownerKey: { type: String, required: true, unique: true }, userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, items: { type: [line], default: [] } }, { timestamps: true, autoCreate: false, autoIndex: false });
export default mongoose.models.Cart || mongoose.model('Cart', schema);
