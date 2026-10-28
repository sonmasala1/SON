/**
 * SON MASALA — Product Seed Script
 * Seeds real masala products into the son_masala Atlas database.
 * Run: node scripts/seed-products.mjs
 */
import dns from 'node:dns';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dns.setServers(['1.1.1.1', '8.8.8.8']);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set in .env'); process.exit(1); }

// ─── Inline minimal schemas (avoids loading full app) ───────────────────────
const variantSchema = new mongoose.Schema({
  label: String,
  sku: String,
  weightGrams: Number,
  price: Number,
  mrp: Number,
  stock: Number,
});

const productSchema = new mongoose.Schema({
  name: String, hindiName: String, sku: String,
  slug: { type: String, unique: true },
  description: String, hindiDescription: String,
  category: String, subcategory: String,
  ingredients: [String], rawSpiceIngredients: [String],
  packSizeOptions: [String], availablePackSizes: [String],
  usageInstructions: String, storageInstructions: String,
  allergenInformation: String,
  status: { type: String, default: 'published' },
  image: String,
  images: [String],
  variants: [variantSchema],
  variantIds: [mongoose.Schema.Types.ObjectId],
  isDemo: { type: Boolean, default: false },
  featured: Boolean,
}, { timestamps: true, autoCreate: false, autoIndex: false });

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
const ProductVariant = mongoose.models.ProductVariant || mongoose.model('ProductVariant', new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  sku: { type: String, unique: true },
  label: String,
  weightGrams: Number,
  pricePaise: Number,
  mrpPaise: Number,
  offerPricePaise: { type: Number, default: null },
  stock: Number,
  isActive: { type: Boolean, default: true },
  isDemo: { type: Boolean, default: false },
}, { timestamps: true, autoCreate: false, autoIndex: false, collection: 'productVariants' }));

// ─── Product data with Unsplash / public domain images ───────────────────────
// Images: using reliable Unsplash spice photos
const PRODUCTS = [
  {
    name: 'Haldi (Turmeric) Powder',
    hindiName: 'हल्दी पाउडर',
    slug: 'haldi-turmeric-powder',
    sku: 'SM-HAL-001',
    description: 'Pure, vibrant turmeric powder ground from the finest Erode and Nizamabad rhizomes. Deep golden colour, earthy aroma, and rich curcumin content for both cooking and wellness.',
    hindiDescription: 'हमारी शुद्ध हल्दी में असली सुनहरा रंग और मिट्टी की भीनी खुशबू है।',
    category: 'ground-spices',
    subcategory: 'Individual Spices',
    featured: true,
    image: 'https://images.unsplash.com/photo-1615485500704-8e990f9900f7?w=800&auto=format&fit=crop',
    images: [
      'https://images.unsplash.com/photo-1615485500704-8e990f9900f7?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1601648764658-cf37e8c89b70?w=800&auto=format&fit=crop',
    ],
    ingredients: ['Pure Turmeric (Curcuma longa)'],
    rawSpiceIngredients: ['Turmeric Rhizome'],
    usageInstructions: 'Add ¼–½ tsp to curries, dals, soups, or warm milk. Also used in face packs and home remedies.',
    storageInstructions: 'Store in a cool, dry place away from direct sunlight. Keep the container tightly sealed.',
    allergenInformation: 'Packed in a facility that handles tree nuts and sesame.',
    variants: [
      { label: '100 g', sku: 'SM-HAL-001-100', weightGrams: 100, price: 55, mrp: 70, stock: 150 },
      { label: '200 g', sku: 'SM-HAL-001-200', weightGrams: 200, price: 99, mrp: 130, stock: 120 },
      { label: '500 g', sku: 'SM-HAL-001-500', weightGrams: 500, price: 220, mrp: 280, stock: 80 },
      { label: '1 kg', sku: 'SM-HAL-001-1000', weightGrams: 1000, price: 399, mrp: 500, stock: 50 },
    ],
  },
  {
    name: 'Lal Mirch (Red Chilli) Powder',
    hindiName: 'लाल मिर्च पाउडर',
    slug: 'lal-mirch-red-chilli-powder',
    sku: 'SM-MIR-001',
    description: 'Fiery Kashmiri and Mathania red chillies blended for a vibrant colour and bold heat. Adds authentic depth to curries, tandoori marinades, and chutneys.',
    hindiDescription: 'कश्मीरी और मथानिया मिर्च का बेहतरीन मिश्रण — गहरा रंग और तीखा ज़ायका।',
    category: 'ground-spices',
    subcategory: 'Individual Spices',
    featured: true,
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=800&auto=format&fit=crop',
    images: [
      'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=800&auto=format&fit=crop',
    ],
    ingredients: ['Kashmiri Red Chilli', 'Mathania Red Chilli'],
    rawSpiceIngredients: ['Red Chilli Pods'],
    usageInstructions: 'Use ½–1 tsp for everyday curries. Bloom in hot oil for maximum colour and flavour release.',
    storageInstructions: 'Store in an airtight container in a cool, dark place.',
    allergenInformation: 'May contain traces of coriander and cumin from shared processing.',
    variants: [
      { label: '100 g', sku: 'SM-MIR-001-100', weightGrams: 100, price: 65, mrp: 85, stock: 130 },
      { label: '200 g', sku: 'SM-MIR-001-200', weightGrams: 200, price: 115, mrp: 150, stock: 100 },
      { label: '500 g', sku: 'SM-MIR-001-500', weightGrams: 500, price: 259, mrp: 330, stock: 70 },
      { label: '1 kg', sku: 'SM-MIR-001-1000', weightGrams: 1000, price: 479, mrp: 600, stock: 40 },
    ],
  },
  {
    name: 'Dhaniya (Coriander) Powder',
    hindiName: 'धनिया पाउडर',
    slug: 'dhaniya-coriander-powder',
    sku: 'SM-DHA-001',
    description: 'Stone-ground coriander seeds from Rajasthan, delivering a warm, lemony, slightly floral aroma. The essential base spice for virtually every Indian curry and sabzi.',
    hindiDescription: 'राजस्थान के खेतों से चुने हुए धनिये का ताज़ा पाउडर — हर सब्ज़ी की जान।',
    category: 'ground-spices',
    subcategory: 'Individual Spices',
    featured: false,
    image: 'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=800&auto=format&fit=crop',
    images: [
      'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1599909631588-76e4d2ce3f49?w=800&auto=format&fit=crop',
    ],
    ingredients: ['Coriander Seeds (Coriandrum sativum)'],
    rawSpiceIngredients: ['Coriander Seeds'],
    usageInstructions: 'Add 1–2 tsp to curries and marinades. Best added after the onion-tomato base is cooked.',
    storageInstructions: 'Store in an airtight container away from heat and moisture.',
    variants: [
      { label: '100 g', sku: 'SM-DHA-001-100', weightGrams: 100, price: 45, mrp: 60, stock: 180 },
      { label: '200 g', sku: 'SM-DHA-001-200', weightGrams: 200, price: 80, mrp: 110, stock: 140 },
      { label: '500 g', sku: 'SM-DHA-001-500', weightGrams: 500, price: 185, mrp: 240, stock: 90 },
      { label: '1 kg', sku: 'SM-DHA-001-1000', weightGrams: 1000, price: 349, mrp: 440, stock: 55 },
    ],
  },
  {
    name: 'Jeera (Cumin) Powder',
    hindiName: 'जीरा पाउडर',
    slug: 'jeera-cumin-powder',
    sku: 'SM-JEE-001',
    description: 'Premium Rajasthan cumin seeds slow-roasted then ground to a fine powder. Intensely aromatic with warm, earthy-sweet notes that elevate raita, dal, and meat dishes.',
    hindiDescription: 'धीमी आँच पर भुने राजस्थानी जीरे का मखमली पाउडर — रायता और दाल की पहचान।',
    category: 'ground-spices',
    subcategory: 'Individual Spices',
    featured: false,
    image: 'https://images.unsplash.com/photo-1610725664285-7c57e6eeac3f?w=800&auto=format&fit=crop',
    images: [
      'https://images.unsplash.com/photo-1610725664285-7c57e6eeac3f?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&auto=format&fit=crop',
    ],
    ingredients: ['Cumin Seeds (Cuminum cyminum)'],
    rawSpiceIngredients: ['Cumin Seeds'],
    usageInstructions: 'Add 1 tsp to tadka for rice and dal. Sprinkle over chaas, raita, or roasted vegetables.',
    storageInstructions: 'Keep sealed in a cool, dry place.',
    variants: [
      { label: '100 g', sku: 'SM-JEE-001-100', weightGrams: 100, price: 60, mrp: 80, stock: 160 },
      { label: '200 g', sku: 'SM-JEE-001-200', weightGrams: 200, price: 110, mrp: 145, stock: 110 },
      { label: '500 g', sku: 'SM-JEE-001-500', weightGrams: 500, price: 245, mrp: 310, stock: 75 },
    ],
  },
  {
    name: 'Garam Masala',
    hindiName: 'गरम मसाला',
    slug: 'garam-masala',
    sku: 'SM-GAR-001',
    description: 'SON MASALA\'s signature garam masala — 13 whole spices freshly ground in traditional proportions. Cardamom, cloves, black pepper, cinnamon, star anise, mace, and more for a warming, complex finish.',
    hindiDescription: 'तेरह मसालों का खास मिश्रण — हर खाने में SON MASALA का जादू।',
    category: 'blended-masalas',
    subcategory: 'Signature Blends',
    featured: true,
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&auto=format&fit=crop',
    images: [
      'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1615485500704-8e990f9900f7?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=800&auto=format&fit=crop',
    ],
    ingredients: ['Green Cardamom', 'Black Cardamom', 'Cloves', 'Black Pepper', 'Cinnamon', 'Star Anise', 'Mace', 'Nutmeg', 'Bay Leaf', 'Cumin', 'Coriander', 'Fennel', 'Dried Rose Petals'],
    rawSpiceIngredients: ['Cardamom Pods', 'Cloves', 'Cinnamon Bark', 'Star Anise', 'Black Pepper Corns'],
    usageInstructions: 'Add ½ tsp at the end of cooking to preserve aroma. Also great in biryani, pulao, and kofta.',
    storageInstructions: 'Always keep the jar tightly closed. Store away from the stove.',
    allergenInformation: 'Free from common allergens. Packed in a dedicated spice-only facility.',
    variants: [
      { label: '50 g', sku: 'SM-GAR-001-50', weightGrams: 50, price: 79, mrp: 99, stock: 200 },
      { label: '100 g', sku: 'SM-GAR-001-100', weightGrams: 100, price: 145, mrp: 180, stock: 170 },
      { label: '200 g', sku: 'SM-GAR-001-200', weightGrams: 200, price: 265, mrp: 330, stock: 100 },
      { label: '500 g', sku: 'SM-GAR-001-500', weightGrams: 500, price: 599, mrp: 750, stock: 60 },
    ],
  },
  {
    name: 'Chole Masala',
    hindiName: 'छोले मसाला',
    slug: 'chole-masala',
    sku: 'SM-CHO-001',
    description: 'Punchy, tangy, and robust — our chole masala captures the soul of Punjabi street food. Pomegranate seed, amchur, and a quartet of whole spices make every chickpea irresistible.',
    hindiDescription: 'पंजाबी छोले का असली ज़ायका — अनारदाना और अमचूर की खटास के साथ।',
    category: 'blended-masalas',
    subcategory: 'Signature Blends',
    featured: true,
    image: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&auto=format&fit=crop',
    images: [
      'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&auto=format&fit=crop',
    ],
    ingredients: ['Coriander', 'Cumin', 'Red Chilli', 'Turmeric', 'Pomegranate Seed (Anardana)', 'Amchur', 'Black Pepper', 'Cloves', 'Cardamom', 'Bay Leaf', 'Cinnamon', 'Salt'],
    usageInstructions: 'Add 1½–2 tsp per cup of soaked chickpeas while cooking. Best bloomed in ghee or oil before adding onion.',
    storageInstructions: 'Refrigerate after opening for maximum freshness.',
    variants: [
      { label: '50 g', sku: 'SM-CHO-001-50', weightGrams: 50, price: 59, mrp: 75, stock: 180 },
      { label: '100 g', sku: 'SM-CHO-001-100', weightGrams: 100, price: 105, mrp: 135, stock: 150 },
      { label: '200 g', sku: 'SM-CHO-001-200', weightGrams: 200, price: 199, mrp: 250, stock: 90 },
    ],
  },
  {
    name: 'Rajma Masala',
    hindiName: 'राजमा मसाला',
    slug: 'rajma-masala',
    sku: 'SM-RAJ-001',
    description: 'A hearty, slow-spiced blend crafted for red kidney beans. Fennel, kasoori methi, and a warm base of roasted whole spices make this the masala for Sunday rajma-chawal.',
    hindiDescription: 'रविवार के राजमा-चावल के लिए बनाया गया हमारा खास राजमा मसाला।',
    category: 'blended-masalas',
    subcategory: 'Signature Blends',
    featured: false,
    image: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=800&auto=format&fit=crop',
    images: [
      'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&auto=format&fit=crop',
    ],
    ingredients: ['Coriander', 'Cumin', 'Red Chilli', 'Turmeric', 'Fennel', 'Kasoori Methi', 'Cloves', 'Cardamom', 'Black Pepper', 'Cinnamon', 'Salt'],
    usageInstructions: 'Add 1–1½ tsp per cup of cooked rajma. Stir in after the tomato base is ready and simmer for 10 minutes.',
    storageInstructions: 'Store in a cool, dry place. Use within 12 months of opening.',
    variants: [
      { label: '50 g', sku: 'SM-RAJ-001-50', weightGrams: 50, price: 55, mrp: 70, stock: 160 },
      { label: '100 g', sku: 'SM-RAJ-001-100', weightGrams: 100, price: 99, mrp: 125, stock: 130 },
      { label: '200 g', sku: 'SM-RAJ-001-200', weightGrams: 200, price: 185, mrp: 235, stock: 80 },
    ],
  },
  {
    name: 'Sabzi Masala',
    hindiName: 'सब्ज़ी मसाला',
    slug: 'sabzi-masala',
    sku: 'SM-SAB-001',
    description: 'An everyday all-rounder for vegetables — mild heat, bright coriander-cumin base, and a hint of kasoori methi. Works beautifully with aloo, gobi, bhindi, or any sabzi.',
    hindiDescription: 'हर सब्ज़ी के लिए एक मसाला — धनिये और जीरे की खुशबू के साथ।',
    category: 'blended-masalas',
    subcategory: 'Everyday Blends',
    featured: false,
    image: 'https://images.unsplash.com/photo-1532336414038-cf19250c5757?w=800&auto=format&fit=crop',
    images: [
      'https://images.unsplash.com/photo-1532336414038-cf19250c5757?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=800&auto=format&fit=crop',
    ],
    ingredients: ['Coriander', 'Cumin', 'Turmeric', 'Red Chilli', 'Kasoori Methi', 'Amchur', 'Black Pepper', 'Salt'],
    usageInstructions: 'Use 1 tsp per serving. Add to the onion-tomato base after it is cooked through.',
    storageInstructions: 'Store in an airtight jar. Keep dry — never use wet spoons.',
    variants: [
      { label: '100 g', sku: 'SM-SAB-001-100', weightGrams: 100, price: 69, mrp: 90, stock: 200 },
      { label: '200 g', sku: 'SM-SAB-001-200', weightGrams: 200, price: 125, mrp: 165, stock: 160 },
      { label: '500 g', sku: 'SM-SAB-001-500', weightGrams: 500, price: 275, mrp: 350, stock: 80 },
    ],
  },
  {
    name: 'Biryani Masala',
    hindiName: 'बिरयानी मसाला',
    slug: 'biryani-masala',
    sku: 'SM-BIR-001',
    description: 'Layered, aromatic, and festive — our biryani masala balances warm whole spices with kewra, saffron notes, and dried rose petals. Crafted for both dum biryani and quick pulao.',
    hindiDescription: 'दम बिरयानी के लिए खास — केवड़े और गुलाब की महक के साथ।',
    category: 'blended-masalas',
    subcategory: 'Signature Blends',
    featured: true,
    image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&auto=format&fit=crop',
    images: [
      'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1615485500704-8e990f9900f7?w=800&auto=format&fit=crop',
    ],
    ingredients: ['Green Cardamom', 'Black Cardamom', 'Cloves', 'Cinnamon', 'Star Anise', 'Mace', 'Nutmeg', 'Bay Leaf', 'Black Pepper', 'Shahi Jeera', 'Dried Rose Petals', 'Kewra Powder'],
    usageInstructions: 'Use 1 tsp per cup of uncooked rice. Layer with fried onions, saffron milk, and ghee for authentic dum biryani.',
    storageInstructions: 'Keep sealed away from light and heat. Best used within 9 months.',
    allergenInformation: 'Contains trace nuts (kewra processing). Free from gluten.',
    variants: [
      { label: '50 g', sku: 'SM-BIR-001-50', weightGrams: 50, price: 89, mrp: 110, stock: 175 },
      { label: '100 g', sku: 'SM-BIR-001-100', weightGrams: 100, price: 159, mrp: 200, stock: 140 },
      { label: '200 g', sku: 'SM-BIR-001-200', weightGrams: 200, price: 299, mrp: 375, stock: 85 },
    ],
  },
  {
    name: 'Sabut Kali Mirch (Whole Black Pepper)',
    hindiName: 'साबुत काली मिर्च',
    slug: 'sabut-kali-mirch-whole-black-pepper',
    sku: 'SM-KAL-001',
    description: 'Bold Malabar and Tellicherry black peppercorns, sun-dried and handpicked. Intense spice, woody depth, and citrus freshness — grind fresh for maximum impact.',
    hindiDescription: 'मालाबार और तेलिचेरी की साबुत काली मिर्च — ताज़ी पिसी हुई खुशबू अलग ही होती है।',
    category: 'whole-spices',
    subcategory: 'Individual Whole Spices',
    featured: false,
    image: 'https://images.unsplash.com/photo-1599909631588-76e4d2ce3f49?w=800&auto=format&fit=crop',
    images: [
      'https://images.unsplash.com/photo-1599909631588-76e4d2ce3f49?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=800&auto=format&fit=crop',
    ],
    ingredients: ['Black Pepper (Piper nigrum)'],
    rawSpiceIngredients: ['Whole Black Peppercorns'],
    botanicalName: 'Piper nigrum',
    usageInstructions: 'Temper in hot oil/ghee for tadka. Crush or grind fresh as needed. Add to marinades, soups, and rasam.',
    storageInstructions: 'Store whole peppercorns in an airtight container for up to 2 years.',
    variants: [
      { label: '50 g', sku: 'SM-KAL-001-50', weightGrams: 50, price: 75, mrp: 95, stock: 140 },
      { label: '100 g', sku: 'SM-KAL-001-100', weightGrams: 100, price: 135, mrp: 170, stock: 110 },
      { label: '250 g', sku: 'SM-KAL-001-250', weightGrams: 250, price: 299, mrp: 380, stock: 70 },
    ],
  },
  {
    name: 'Elaichi (Green Cardamom)',
    hindiName: 'हरी इलायची',
    slug: 'elaichi-green-cardamom',
    sku: 'SM-ELA-001',
    description: 'Plump, fragrant Kerala green cardamom pods with high volatile oil content. Intensely sweet-spicy aroma for chai, kheer, biryani, and mithai.',
    hindiDescription: 'केरल की हरी इलायची — चाय, खीर और मिठाई की खुशबू।',
    category: 'whole-spices',
    subcategory: 'Individual Whole Spices',
    featured: false,
    image: 'https://images.unsplash.com/photo-1607305387299-a3d9611cd469?w=800&auto=format&fit=crop',
    images: [
      'https://images.unsplash.com/photo-1607305387299-a3d9611cd469?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&auto=format&fit=crop',
    ],
    ingredients: ['Green Cardamom (Elettaria cardamomum)'],
    rawSpiceIngredients: ['Green Cardamom Pods'],
    botanicalName: 'Elettaria cardamomum',
    usageInstructions: 'Lightly crush pods before adding to chai or rice dishes. Use 2–3 pods per cup of milk for masala chai.',
    storageInstructions: 'Store in an airtight glass jar in a cool place. Do not refrigerate.',
    variants: [
      { label: '25 g', sku: 'SM-ELA-001-25', weightGrams: 25, price: 120, mrp: 150, stock: 100 },
      { label: '50 g', sku: 'SM-ELA-001-50', weightGrams: 50, price: 225, mrp: 285, stock: 80 },
      { label: '100 g', sku: 'SM-ELA-001-100', weightGrams: 100, price: 420, mrp: 530, stock: 50 },
    ],
  },
  {
    name: 'Chai Masala',
    hindiName: 'चाय मसाला',
    slug: 'chai-masala',
    sku: 'SM-CHA-001',
    description: 'SON MASALA\'s beloved chai masala — a warming blend of ginger, cardamom, cinnamon, cloves, and black pepper. One pinch transforms everyday chai into a ritual.',
    hindiDescription: 'एक चुटकी — और आपकी चाय बन जाती है एक यादगार लम्हा।',
    category: 'blended-masalas',
    subcategory: 'Beverage Blends',
    featured: true,
    image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=800&auto=format&fit=crop',
    images: [
      'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1607305387299-a3d9611cd469?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&auto=format&fit=crop',
    ],
    ingredients: ['Dry Ginger', 'Green Cardamom', 'Cinnamon', 'Cloves', 'Black Pepper', 'Nutmeg'],
    usageInstructions: 'Add a generous pinch (⅛ tsp) to your tea while boiling. Also lovely in golden milk or coffee.',
    storageInstructions: 'Keep sealed and away from steam from the stove.',
    variants: [
      { label: '50 g', sku: 'SM-CHA-001-50', weightGrams: 50, price: 69, mrp: 89, stock: 250 },
      { label: '100 g', sku: 'SM-CHA-001-100', weightGrams: 100, price: 119, mrp: 150, stock: 200 },
      { label: '200 g', sku: 'SM-CHA-001-200', weightGrams: 200, price: 215, mrp: 270, stock: 120 },
    ],
  },
  // ─── Combo Packs ───────────────────────────────────────────────────────────
  {
    name: 'Starter Masala Combo (4 Packs)',
    hindiName: 'स्टार्टर मसाला कॉम्बो',
    slug: 'starter-masala-combo-4-pack',
    sku: 'SM-COM-001',
    description: 'The perfect starting kit — four 100 g packs of Haldi, Lal Mirch, Dhaniya, and Jeera powder. Save ₹40 over buying individually. Great as a housewarming or wedding gift.',
    hindiDescription: 'चार ज़रूरी मसालों का कॉम्बो — घर बसाने की शुरुआत के लिए।',
    category: 'combo-packs',
    subcategory: 'Starter Combos',
    featured: true,
    image: 'https://images.unsplash.com/photo-1628191077820-f60e56d86059?w=800&auto=format&fit=crop',
    images: [
      'https://images.unsplash.com/photo-1628191077820-f60e56d86059?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1615485500704-8e990f9900f7?w=800&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&auto=format&fit=crop',
    ],
    ingredients: ['Haldi (Turmeric)', 'Lal Mirch (Red Chilli)', 'Dhaniya (Coriander)', 'Jeera (Cumin)'],
    usageInstructions: 'Contains: Haldi 100g, Lal Mirch 100g, Dhaniya 100g, Jeera 100g. Individual usage instructions are on each pack.',
    variants: [
      { label: '4 × 100 g', sku: 'SM-COM-001-4X100', weightGrams: 400, price: 259, mrp: 299, stock: 100 },
    ],
  },
];

// ─── Main seed function ──────────────────────────────────────────────────────
async function seed() {
  console.log('\n🌶  SON MASALA Product Seeder\n');
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('✅ Connected to:', mongoose.connection.name);

  // Ensure collections/indexes exist
  await mongoose.connection.db.createCollection('products').catch(() => {});
  await mongoose.connection.db.createCollection('productVariants').catch(() => {});

  let created = 0, updated = 0, skipped = 0;

  for (const data of PRODUCTS) {
    const { variants: variantData, ...productData } = data;

    // Upsert the product
    const existing = await Product.findOne({ slug: productData.slug });
    let product;

    if (existing) {
      // Only update non-critical fields; don't reset stock
      Object.assign(existing, {
        name: productData.name, hindiName: productData.hindiName,
        description: productData.description, hindiDescription: productData.hindiDescription,
        image: productData.image, images: productData.images,
        featured: productData.featured, ingredients: productData.ingredients,
        rawSpiceIngredients: productData.rawSpiceIngredients,
        usageInstructions: productData.usageInstructions,
        storageInstructions: productData.storageInstructions,
        allergenInformation: productData.allergenInformation || '',
        botanicalName: productData.botanicalName || '',
        status: 'published',
      });
      await existing.save();
      product = existing;
      updated++;
      console.log(`  ↻  Updated: ${productData.name}`);
    } else {
      product = await Product.create({ ...productData, status: 'published', isDemo: false });
      created++;
      console.log(`  ✚  Created: ${productData.name}`);
    }

    // Upsert variants as embedded (the productService reads embedded variants when no ProductVariants exist)
    // We update the embedded variants array on the product document
    product.variants = variantData.map(v => ({
      label: v.label,
      sku: v.sku,
      weightGrams: v.weightGrams,
      price: v.price,
      mrp: v.mrp,
      stock: v.stock,
    }));
    await product.save();
  }

  console.log(`\n✅ Seeding complete — ${created} created, ${updated} updated, ${skipped} skipped`);
  console.log(`📦 Total products in DB: ${await Product.countDocuments({ status: 'published', isDemo: false })}`);
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seeding failed:', err.message);
  process.exit(1);
});

