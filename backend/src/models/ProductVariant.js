import mongoose from 'mongoose';
import { assertProductImages } from '../validators/productImage.js';
const integer = { validator: Number.isSafeInteger, message: 'An integer value is required' };
const schema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  sku: { type: String, required: true, unique: true },
  label: { type: String, required: true },
  weightGrams: { type: Number, min: 1, required: true, validate: integer },
  pricePaise: { type: Number, min: 1, required: true, validate: integer },
  mrpPaise: { type: Number, min: 1, required: true, validate: integer },
  offerPricePaise: { type: Number, min: 1, default: null, validate: { validator: value => value == null || Number.isSafeInteger(value) } },
  stock: { type: Number, min: 0, required: true, validate: integer },
  isActive: { type: Boolean, default: true, index: true },
  isDemo: { type: Boolean, default: false, index: true },
  isSample: { type: Boolean, default: false },
  image: { type: String, default: '' },
  imageCrop: { type: String, enum: ['full', 'left-half', 'right-half', 'left-third', 'middle-third', 'right-third'], default: 'full' },
}, { timestamps: true, autoCreate: false, autoIndex: false, collection: 'productVariants' });
schema.pre('validate', function () {
  if (this.mrpPaise < this.pricePaise) this.invalidate('mrpPaise', 'MRP cannot be below the price');
  if (this.offerPricePaise != null && this.offerPricePaise >= this.pricePaise) this.invalidate('offerPricePaise', 'Offer must be below the price');
});

async function validateOwnedImage(variant, session) {
  if (!variant.image) return;
  const parent = await mongoose.model('Product').findById(variant.productId).session(session || null).lean();
  if (!parent) throw new Error('Variant image requires an existing parent product.');
  assertProductImages({ ...parent, image: '', images: [], variants: [variant] });
}
schema.pre('validate', async function () { await validateOwnedImage(this.toObject(), this.$session()); });
schema.pre(['updateOne', 'findOneAndUpdate'], async function () {
  const update = this.getUpdate() || {};
  if (Array.isArray(update)) throw new Error('Pipeline variant updates cannot bypass image ownership validation.');
  const values = { ...(update.$setOnInsert || {}), ...(update.$set || {}), ...Object.fromEntries(Object.entries(update).filter(([key]) => !key.startsWith('$'))) };
  if (!['image', 'productId', 'sku', 'imageCrop'].some(key => key in values)) return;
  const stored = await this.model.findOne(this.getFilter()).session(this.getOptions().session || null).lean();
  await validateOwnedImage({ ...(stored || this.getFilter()), ...values }, this.getOptions().session);
});
schema.pre(['updateMany', 'replaceOne', 'findOneAndReplace'], function () {
  const update = this.getUpdate() || {};
  const fields = Object.entries(update).flatMap(([key, value]) => key.startsWith('$') ? Object.keys(value || {}) : [key]);
  if (Array.isArray(update) || /replace/i.test(this.op) || fields.some(field => /^(image|imageCrop|productId|sku)(\.|$)/.test(field))) throw new Error('Update individual variants to validate product image ownership.');
});
schema.index({ productId: 1, label: 1 }, { unique: true });
export default mongoose.models.ProductVariant || mongoose.model('ProductVariant', schema);
