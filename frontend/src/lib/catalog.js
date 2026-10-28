export const categories = [
  { slug: 'ground-spices', name: 'Ground Spices', hindi: 'रोज़ का स्वाद', text: 'The heart of everyday cooking', color: 'gold', position: '85% 85%', number: '01' },
  { slug: 'whole-spices', name: 'Whole Spices', hindi: 'खुशबू का खज़ाना', text: 'Small ingredients. Beautiful aroma.', color: 'green', position: '53% 40%', number: '02' },
  { slug: 'blended-masalas', name: 'Blended Masalas', hindi: 'खास पलों के लिए', text: 'Bring your favourite dishes to life', color: 'red', position: '80% 10%', number: '03' },
];
export const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
export const moneyPaise = value => money((Number.isSafeInteger(value) ? value : 0) / 100);
export function productGallery(product) {
  const variants = product.variants || [];
  const images = product.images?.length ? product.images : (product.image ? [product.image] : []);
  const gallery = variants.some(item => item.image)
    ? variants.map((item, index) => ({ url: item.image || product.image, crop: item.imageCrop || 'full', label: item.label, variantIndex: index }))
    : images.map((url, index) => ({ url, crop: 'full', label: `Image ${index + 1}` }));
  return gallery.filter((item, index) => gallery.findIndex(other => other.url === item.url && other.crop === item.crop) === index);
}
export function safeImage(value) {
  if (typeof value !== 'string') return null;
  return /^\/images\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:webp|png|jpe?g|avif)$/i.test(value) ? value : null;
}
