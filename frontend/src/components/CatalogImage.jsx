'use client';
import Image from 'next/image';
import { safeImage } from '@/lib/catalog';

// Contact sheets retain the generated artwork; each pack displays its own panel.
export default function CatalogImage({ src, crop = 'full', alt = '', onError, sizes }) {
  const frames = { 'left-half': [2, 0], 'right-half': [2, 1], 'left-third': [3, 0], 'middle-third': [3, 1], 'right-third': [3, 2] };
  const [columns, column] = frames[crop] || [1, 0];
  const image = safeImage(src);
  if (!image) return <span className="image-unavailable" role="img" aria-label={`${alt || 'Product'}: image unavailable`}>Product image coming soon</span>;
  return <span className="catalog-image-frame" data-image-crop={crop}>
    <Image src={image} alt={alt} width={columns * 1024} height={1024} unoptimized
      sizes={sizes || '(max-width: 760px) 100vw, 50vw'} onError={onError}
      style={{ position: 'absolute', top: 0, height: '100%', width: `${columns * 100}%`, maxWidth: 'none', left: `${column * -100}%`, objectFit: columns === 1 ? 'contain' : 'fill' }} />
  </span>;
}
