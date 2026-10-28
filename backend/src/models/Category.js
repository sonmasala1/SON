import mongoose from 'mongoose';
const schema = new mongoose.Schema({ name: { type: String, required: true }, hindiName: String, slug: { type: String, unique: true, required: true }, sort: { type: Number, default: 0 }, status: { type: String, enum: ['active', 'archived'], default: 'active' } }, { timestamps: true, autoCreate: false, autoIndex: false });
export default mongoose.models.Category || mongoose.model('Category', schema);
