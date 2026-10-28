import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  consent: { type: Boolean, required: true },
}, { timestamps: true, autoCreate: false, autoIndex: false });

export default mongoose.models.Subscriber || mongoose.model('Subscriber', schema);
