import { describe, it, expect } from 'vitest';
import { safeImage, productGallery } from './catalog';
describe('catalogue images', () => {
  it('accepts local product images without guessing a fallback', () => {
    expect(safeImage('/images/products/badi-elaichi.png')).toBe('/images/products/badi-elaichi.png');
    for (const value of [null, {}, 'https://images.unsplash.com/photo.jpg', '//example.com/photo.jpg', '/images/../other.png', '/images/product-placeholder.svg', 'javascript:alert(1)']) expect(safeImage(value)).toBeNull();
  });
  it('shows one photo when all weights share it and preserves distinct photos', () => {
    const image = '/images/products/jeera.png';
    const variants = ['100 g', '250 g', '500 g'].map(label => ({ label, image }));
    expect(productGallery({ image, variants })).toHaveLength(1);
    variants[2].image = '/images/products/jeera-back.png';
    const gallery = productGallery({ image, variants });
    expect(gallery).toHaveLength(2);
    expect(gallery[1].variantIndex).toBe(2);
  });
});
