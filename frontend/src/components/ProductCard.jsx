'use client';

import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import Link from 'next/link';
import { useState } from 'react';
import CatalogImage from './CatalogImage';
import { useRouter } from 'next/navigation';
import { moneyPaise, safeImage, productGallery } from '@/lib/catalog';
import { useStore } from './StoreProvider';
import Icon from './Icon';
import { useLocale } from './LocaleProvider';
import { productName, productDescription } from '@/lib/i18n';

export default function ProductCard({ product, detail = false }) {
  const variants = product.variants || [];
  const allImages = product.images?.length ? product.images : (product.image ? [product.image] : []);

  const [variantIndex, setVariantIndex] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const [selectedGallery, setSelectedGallery] = useState(null);

  const { addToCart, wishlist, toggleWishlist, busy, loading, user, wishlistBusy } = useStore();
  const router = useRouter();
  const { locale } = useLocale();
  const name = productName(product, locale);
  const variant = variants[variantIndex];
  const selectedImage = selectedGallery || { url: variant?.image || product.image || allImages[0], crop: variant?.imageCrop || 'full' };
  const image = !imageFailed && safeImage(selectedImage.url);
  const gallery = productGallery(product);
  const variantUnitPricePaise = Number.isFinite(Number(variant?.unitPricePaise))
    ? Number(variant.unitPricePaise)
    : Number.isFinite(Number(variant?.pricePaise))
      ? Number(variant.pricePaise)
      : Number.isFinite(Number(variant?.price))
        ? Math.round(Number(variant.price) * 100)
        : 0;
  const hasPrice = variantUnitPricePaise > 0;
  const available = product.status === 'published' && variant?.stock > 0 && hasPrice;
  const isDraft = product.status === 'draft';
  const hasProductDetails = product.ingredients?.length || product.rawSpiceIngredients?.length
    || product.botanicalName || product.origin || product.usageInstructions || product.storageInstructions
    || product.shelfLife || product.allergenInformation
    || (product.ingredientCompositionVerified && product.ingredientComposition?.length > 0);

  function selectVariant(idx) {
    setVariantIndex(idx);
    setSelectedGallery(null);
    setImageFailed(false);
  }

  function selectGalleryImage(item) {
    if (item.variantIndex != null) setVariantIndex(item.variantIndex);
    setSelectedGallery(item);
    setImageFailed(false);
  }

  async function buyNow() {
    if (await addToCart(product, variant, false)) router.push(user ? '/checkout' : '/login?next=%2Fcheckout');
  }

  return (
    <article className={`product-card ${detail ? 'product-detail' : ''}`}>

      <div className="product-media">
      <div className="product-image">
        {image
          ? <CatalogImage src={image} crop={selectedImage.crop} alt={`${name} ${variant?.label || ''}`} onError={() => setImageFailed(true)} />
          : <div className="image-unavailable"><Icon name="leaf" size={45} /><span><Text>Product image coming soon</Text></span></div>
        }
        {user && (
          <LocalizedAttrs>
            <button
              disabled={wishlistBusy || loading}
              className={`icon-button save-product ${wishlist.includes(product.slug) ? 'saved' : ''}`}
              onClick={() => toggleWishlist(product.slug)}
              aria-label={`${wishlist.includes(product.slug) ? 'Remove' : 'Save'} ${name} ${wishlist.includes(product.slug) ? 'from' : 'to'} wishlist`}
              aria-pressed={wishlist.includes(product.slug)}
            >
              <Icon name="heart" />
            </button>
          </LocalizedAttrs>
        )}
      </div>

      {/* Thumbnail gallery — only on detail page */}
      {detail && gallery.length > 1 && (
        <div className="product-gallery" role="group" aria-label="Product images">
          {gallery.map((item, index) => (
            <button
              type="button"
              key={`${item.url}-${index}`}
              className={`gallery-thumb ${selectedImage.url === item.url && selectedImage.crop === item.crop ? 'active' : ''}`}
              aria-label={`Show ${item.label} image`}
              aria-pressed={selectedImage.url === item.url && selectedImage.crop === item.crop}
              onClick={() => selectGalleryImage(item)}
            >
              <CatalogImage src={item.url} crop={item.crop} sizes="76px" />
              <span className="gallery-size-label">{item.label}</span>
            </button>
          ))}
        </div>
      )}
      </div>

      <div className="product-copy">
        {product.imageKind === 'representative-demo' && <p className="product-image-disclosure"><Text>Product image; actual packaging may differ.</Text></p>}
        {product.imageKind === 'placeholder' && <p className="product-image-disclosure"><Text>Product photograph pending verification.</Text></p>}
        <p className="eyebrow"><Text>{product.subcategory || product.category.replaceAll('-', ' ')}</Text></p>
        {detail
          ? <h1><Text>{name}</Text></h1>
          : <h3><Link href={`/product/${product.slug}`}><Text>{name}</Text></Link></h3>
        }
        {product.hindiName && <LocalizedAttrs><p className="product-hindi" lang="hi">{product.hindiName}</p></LocalizedAttrs>}

        {/* Detail-only: description + specs */}
        {detail && (
          <>
            <p className="product-description"><Text>{productDescription(product, locale)}</Text></p>
            <p className="sku-label"><Text>SKU: </Text><Text>{variant?.sku || product.sku || '—'}</Text></p>
            {hasProductDetails && (
              <dl className="product-specifications">
                {product.ingredients?.length > 0 && <><dt><Text>Ingredients</Text></dt><dd>{product.ingredients.join(', ')}</dd></>}
                {product.rawSpiceIngredients?.length > 0 && <><dt><Text>Raw spice ingredients</Text></dt><dd>{product.rawSpiceIngredients.join(', ')}</dd></>}
                {product.ingredientCompositionVerified && product.ingredientComposition?.length > 0 && (
                  <><dt><Text>Verified blend composition</Text></dt><dd>{product.ingredientComposition.map(i => `${i.name}: ${i.percentage}%`).join(', ')}</dd></>
                )}
                {product.botanicalName && <><dt><Text>Botanical name</Text></dt><dd>{product.botanicalName}</dd></>}
                {product.originVerificationStatus === 'verified' && product.origin && <><dt><Text>Origin</Text></dt><dd>{product.origin}</dd></>}
                {product.usageInstructions && <><dt><Text>Usage</Text></dt><dd>{product.usageInstructions}</dd></>}
                {product.storageInstructions && <><dt><Text>Storage</Text></dt><dd>{product.storageInstructions}</dd></>}
                {product.shelfLifeVerificationStatus === 'verified' && product.shelfLife && <><dt><Text>Shelf life</Text></dt><dd>{product.shelfLife}</dd></>}
                {product.allergenInformation && <><dt><Text>Allergen information</Text></dt><dd>{product.allergenInformation}</dd></>}
              </dl>
            )}
          </>
        )}

        {/* Size pill buttons — replaces the dropdown */}
        {variants.length > 0 && (
          <div className="variant-picker" role="group" aria-label="Select weight">
            <p className="variant-picker-label"><Text>Weight</Text></p>
            <div className="variant-pills">
              {variants.map((item, idx) => (
                <button
                  key={item._id || item.sku || idx}
                  type="button"
                  className={`variant-pill${idx === variantIndex ? ' selected' : ''}${item.stock === 0 ? ' out-of-stock' : ''}`}
                  onClick={() => selectVariant(idx)}
                  aria-pressed={idx === variantIndex}
                  disabled={item.stock === 0}
                  title={item.stock === 0 ? 'Out of stock' : item.label}
                >
                  <Text>{item.label}</Text>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Price row */}
        <div className="price-row">
          <div>
            <strong><Text>{hasPrice ? moneyPaise(variantUnitPricePaise) : 'Price coming soon'}</Text></strong>
            {variant?.mrpPaise > variant?.unitPricePaise && <del className="mrp"><Text>{moneyPaise(variant.mrpPaise)}</Text></del>}
          </div>
          <span className={`stock-badge${available ? ' in-stock' : ' no-stock'}`}>
            <Text>{isDraft ? 'Coming Soon' : available ? 'In stock' : !hasPrice ? 'Coming soon' : 'Out of stock'}</Text>
          </span>
        </div>

        {/* Actions */}
        <div className="product-actions">
          <button className="button" disabled={!available || busy || loading} onClick={() => addToCart(product, variant)}>
            <Icon name="bag" size={24} /><Text>{isDraft ? 'Coming Soon' : available ? 'Add to Cart' : 'Unavailable'}</Text>
          </button>
          <button className="button button-outline" disabled={!available || busy || loading} onClick={buyNow}>
            <Text>Buy Now</Text>
          </button>
        </div>
        {!detail && <Link className="details-link" href={`/product/${product.slug}`}><Text>View Details </Text><Icon name="arrow" size={24} /></Link>}
      </div>
    </article>
  );
}
