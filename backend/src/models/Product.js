import mongoose from 'mongoose';
import { productImageIssues } from '../validators/productImage.js';

const variantSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true },
  sku: { type: String, trim: true },
  weightGrams: { type: Number, min: 1, default: null },
  price: { type: Number, min: 0, default: null },
  mrp: { type: Number, min: 0, default: null },
  stock: { type: Number, min: 0, default: 0, validate: Number.isInteger },
  image: { type: String, default: '' },
  isSample: { type: Boolean, default: false },
  imageCrop: { type: String, enum: ['full', 'left-half', 'right-half', 'left-third', 'middle-third', 'right-third'], default: 'full' },
});

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  hindiName: { type: String, default: '' },
  sku: { type: String, trim: true, uppercase: true, sparse: true },
  hindiDescription: { type: String, default: '' },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, default: '' },
  category: { type: String, required: true, trim: true },
  subcategory: { type: String, default: '' },
  ingredients: { type: [String], default: [] },
  rawSpiceIngredients: { type: [String], default: [] },
  ingredientComposition: { type: [{ name: String, percentage: { type: Number, min: 0, max: 100 } }], default: [] },
  ingredientCompositionVerified: { type: Boolean, default: false },
  ingredientCompositionSource: { type: String, default: '' },
  botanicalName: { type: String, default: '' },
  origin: { type: String, default: '' },
  originVerificationStatus: { type: String, enum: ['unknown', 'verified'], default: 'unknown' },
  originVerificationSource: { type: String, default: '' },
  packSizeOptions: { type: [String], default: [] },
  availablePackSizes: { type: [String], default: [] },
  usageInstructions: { type: String, default: '' },
  storageInstructions: { type: String, default: '' },
  shelfLife: { type: String, default: '' },
  shelfLifeVerificationStatus: { type: String, enum: ['unknown', 'verified'], default: 'unknown' },
  shelfLifeVerificationSource: { type: String, default: '' },
  allergenInformation: { type: String, default: '' },
  inventoryStatus: { type: String, enum: ['unknown', 'known'], default: 'unknown' },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
  catalogVisible: { type: Boolean, default: false },
  image: { type: String, default: '' },
  images: { type: [String], default: [] },
  imageKind: { type: String, enum: ['', 'actual', 'representative-demo', 'placeholder'], default: '' },
  variants: { type: [variantSchema], default: [] },
  variantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant' }],
  isDemo: { type: Boolean, default: false, index: true },
  isSample: { type: Boolean, default: false },
  featured: { type: Boolean, default: false },
}, { timestamps: true, autoCreate: false, autoIndex: false });

productSchema.index({ sku: 1 }, { sparse: true });

productSchema.pre('validate', function () {
  for (const issue of productImageIssues(this)) this.invalidate(issue.path, issue.message);
});

// Query writes do not run document validation middleware. Require document saves for media/identity changes.
productSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace'], function () {
  const update = this.getUpdate() || {};
  const protectedFields = /^(?:image|images|imageKind|variants|sku|slug|name|hindiName|category)(?:\.|$)/;
  const fields = Object.entries(update).flatMap(([key, value]) => key.startsWith('$') ? Object.keys(value || {}) : [key]);
  if (Array.isArray(update) || fields.some(field => protectedFields.test(field)) || /replace/i.test(this.op)) {
    throw new Error('Save the product document to validate image ownership before changing media or identity.');
  }
});

productSchema.pre('validate', function () {
  if (this.origin && (this.originVerificationStatus !== 'verified' || !this.originVerificationSource.trim())) {
    this.invalidate('origin', 'Origin claims require a verified source.');
  }
  if (this.shelfLife && (this.shelfLifeVerificationStatus !== 'verified' || !this.shelfLifeVerificationSource.trim())) {
    this.invalidate('shelfLife', 'Shelf-life claims require a verified source.');
  }
  if (this.ingredientComposition.length && (!this.ingredientCompositionVerified || !this.ingredientCompositionSource.trim())) {
    this.invalidate('ingredientComposition', 'Blend percentages require a verified SON MASALA specification source.');
  }
  if (this.ingredientComposition.length && Math.abs(this.ingredientComposition.reduce((sum, item) => sum + (item.percentage || 0), 0) - 100) > 0.01) {
    this.invalidate('ingredientComposition', 'Verified ingredient percentages must total 100.');
  }
});

productSchema.pre('validate', function () {
  if (this.status !== 'published') return;
  if (!this.description.trim()) this.invalidate('description', 'Published products require a description');
  if (!this.variantIds.length && (!this.variants.length || this.variants.some(variant => !(variant.price > 0)))) {
    this.invalidate('variants', 'Published products require variants with actual positive prices');
  }
});

export default mongoose.models.Product || mongoose.model('Product', productSchema);
