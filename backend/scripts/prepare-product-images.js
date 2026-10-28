import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const snapshot = JSON.parse(readFileSync(new URL('../.runtime/product-image-snapshot.json', import.meta.url)));
const manifestPath = new URL('../src/data/productImageManifest.json', import.meta.url);
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath)).products : [];
const subjects = {
  'badi-elaichi': 'Large dark brown-black deeply wrinkled black cardamom pods; no green cardamom.',
  jaiphal: 'Whole brown oval nutmeg seeds with fine woody wrinkled surfaces, one cut nutmeg showing marbled interior; no mace.',
  javitri: 'Only dried orange-red delicate lacy mace arils in natural irregular branching blades; no nutmeg nuts.',
  'methi-dana': 'Small angular golden ochre fenugreek seeds with characteristic groove; no fenugreek leaves.',
  'sukhi-adrak': 'Whole dried ginger rhizome pieces, pale beige chalky fibrous knobbly roots; no fresh ginger or powder.',
  rai: 'Tiny round dark brown to black mustard seeds; no peppercorns.',
  pippali: 'Whole dried Indian long pepper spikes, dark brown elongated tiny catkin-shaped cones with densely bumpy texture; no round peppercorns.',
  jeera: 'Whole slender tan-brown cumin seeds with longitudinal ridges.',
  'sabut-dhaniya': 'Whole round tan coriander seeds with fine longitudinal ribs.',
  ajwain: 'Very small oval grey-brown carom seeds with prominent longitudinal ridges.',
  saunf: 'Whole pale green elongated curved fennel seeds with longitudinal ribs.',
  'choti-elaichi': 'Whole small pale green cardamom pods; no black cardamom.',
  'kali-mirch': 'Whole black peppercorns, round dark brown-black wrinkled spheres.',
  laung: 'Whole dark brown dried cloves with nail-like stems and rounded flower heads.',
  dalchini: 'Dry brown cinnamon bark sticks and rolled quills.',
  'tej-patta': 'Dried Indian bay leaves, elongated tan olive leaves with three prominent longitudinal veins.',
  'chakri-phool': 'Whole brown eight-pointed star anise seed pods.',
  kalonji: 'Small matte black angular nigella seeds.',
  'shah-jeera': 'Slender curved dark brown shahi jeera caraway-like seeds.',
  'safed-mirch': 'Whole round creamy beige white peppercorns.',
  sarson: 'Small round yellow mustard seeds.',
  hing: 'Pale beige asafoetida powder, no whole seeds or resin chunks.',
  'kasuri-methi': 'Dried crumbled grey-green fenugreek leaves; no fenugreek seeds.',
  'kabab-chini': 'Whole brown cubeb pepper berries with distinctive attached short tails.',
  nagkesar: 'Dried culinary nagkesar flower buds, tiny slender brown buds with ochre tips.',
  'stone-flower': 'Dry edible stone flower lichen flakes, irregular papery grey-black and pale cream ruffled pieces.',
  'amchur-slices': 'Dry pale tan thin irregular unripe mango slices.',
  anardana: 'Dried small dark reddish brown pomegranate seeds.',
  'black-cardamom-seeds': 'Loose small dark brown black cardamom seeds removed from pods; no pods.',
  'green-cardamom-seeds': 'Loose tiny dark brown green cardamom seeds removed from pods; no pods.',
  saffron: 'Only slender deep crimson saffron stigma threads, with tiny golden tips.',
  'sichuan-pepper': 'Open reddish brown Sichuan pepper husks, split shells showing hollow interiors.',
  'starter-masala-combo-4-pack': 'Exactly four separate small bowls: golden turmeric powder, red chilli powder, tan coriander powder, brown cumin powder. Only these four dry spice powders, no dish.',
};
const aliases = { 'long-pepper': 'pippali', mace: 'javitri', 'turmeric-fingers': 'sabut-haldi', 'elaichi-green-cardamom': 'choti-elaichi', 'sabut-kali-mirch-whole-black-pepper': 'kali-mirch' };
const groundSpecialty = new Set(['smoked-paprika', 'sweet-paprika', 'sumac']);
const wholeSpecialty = new Set(['black-cardamom-seeds', 'green-cardamom-seeds', 'long-pepper', 'mace', 'turmeric-fingers', 'black-cumin', 'white-cumin', 'sichuan-pepper', 'saffron']);
const products = snapshot.products.map(product => {
  const prior = previous.find(row => row.productId === product._id);
  const category = groundSpecialty.has(product.slug) ? 'ground-spices' : wholeSpecialty.has(product.slug) ? 'whole-spices' : product.category;
  const subject = subjects[product.slug] || subjects[aliases[product.slug]] || (category === 'blended-masalas'
    ? `Only dry ${product.name} ground spice blend, with realistic natural powder texture. A representative demo, not a claim of exact proprietary formulation.`
    : `Only ${product.name}, in the whole, dried, seed, leaf or ground form explicitly specified by its product name. Preserve its distinctive natural colour and texture.`);
  const filename = product.slug === 'pippali' ? 'pipli' : product.slug === 'sukhi-adrak' ? 'saunth' : product.slug;
  return {
    productId: product._id, sku: product.sku || '', slug: product.slug, name: product.name, hindiName: product.hindiName || '',
    category, previousCategory: product.category,
    variantSkus: [...new Set([...(product.variants || []).map(v => v.sku), ...snapshot.variants.filter(v => v.productId === product._id).map(v => v.sku)].filter(Boolean))],
    image: `/images/products/${filename}.png`,
    sha256: prior?.sha256 || '', visuallyVerified: prior?.visuallyVerified || false,
    prompt: `Use case: product-mockup. Asset type: square ecommerce spice demo photo for ${product.name} (${product.hindiName || ''}). Subject: ${subject} One small ivory ceramic bowl containing the named spice, with a few matching pieces beside it, on a warm cream seamless background. Soft studio daylight, high-quality photorealism, crisp natural botanical detail, three-quarter overhead view with generous margins. No other unrelated spice, no prepared food, no beverages, no packaging, no text, no watermark. Each image must depict this exact named product.`,
  };
});
mkdirSync(new URL('../../frontend/public/images/products/', import.meta.url), { recursive: true });
writeFileSync(manifestPath, JSON.stringify({ version: 1, database: 'son_masala', products }, null, 2) + '\n');
console.log(`Prepared ${products.length} exact product identities and image prompts: ${fileURLToPath(manifestPath)}`);
