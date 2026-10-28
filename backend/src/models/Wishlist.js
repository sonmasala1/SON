import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
}, { timestamps: true, autoCreate: false, autoIndex: false });
export default mongoose.models.Wishlist || mongoose.model('Wishlist', schema);
