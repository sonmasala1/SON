'use client';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getProduct } from '@/lib/api';
import ProductCard from './ProductCard';
import ReviewForm from './ReviewForm';

export default function ProductDetail({ slug }) {
  const [product, setProduct] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(null); setProduct(null);
    getProduct(slug, { signal: controller.signal }).then(result => setProduct(result.product)).catch(error => { if (!controller.signal.aborted) setError(error); });
    return () => controller.abort();
  }, [slug, attempt]);
  if (error) return <div className="catalog-state" role="alert"><h1><Text error>{error.status === 404 ? 'This spice isn’t on the shelf.' : 'We couldn’t load this product.'}</Text></h1><p><Text error>{error.message}</Text></p><Text error>{error.status !== 404 && <button className="button" onClick={() => setAttempt(value => value + 1)}><Text>{"Try again"}</Text></button>}</Text><Link className="text-link" href="/shop"><Text>{"Back to the shop"}</Text></Link></div>;
  if (!product) return <LocalizedAttrs><div className="product-skeleton" role="status" aria-label="Loading product"><div /><span /><span /></div></LocalizedAttrs>;
  return <><ProductCard key={product._id} product={product} detail />{product.status === 'published' && <ReviewForm productId={product._id} />}</>;
}
