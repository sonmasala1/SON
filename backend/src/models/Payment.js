import mongoose from 'mongoose';
const schema = new mongoose.Schema({ orderId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, ref: 'Order' }, paymentMode: { type: String, enum: ['DEMO'], required: true }, status: { type: String, enum: ['PENDING', 'PAID_DEMO', 'FAILED', 'CANCELLED'], default: 'PENDING' }, amountPaise: { type: Number, required: true }, isDemo: { type: Boolean, default: true, immutable: true } }, { timestamps: true, autoCreate: false, autoIndex: false });
export default mongoose.models.Payment || mongoose.model('Payment', schema);
