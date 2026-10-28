'use client';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import Link from 'next/link';
import { useStore } from './StoreProvider';
import ProductCard from './ProductCard';
import CartContents from './CartContents';
import Icon from './Icon';

export default function SavedProducts({ mode }) {
  const { wishlistProducts, loading, user, wishlistError, refreshCart } = useStore();
  if (mode === 'cart') return <CartContents />;
  if (loading) return <div className="catalog-state" role="status"><Text>{"Checking your wishlist…"}</Text></div>;
  if (!user) return <div className="catalog-state"><Icon name="heart" size={38} /><h2><Text>{"Sign in to save your favourites."}</Text></h2><p><Text>{"Your favourites stay private and follow your account."}</Text></p><Link className="button" href="/login?next=%2Fwishlist"><Text>{"Sign In"}</Text></Link></div>;
  if (wishlistError) return <div className="catalog-state" role="alert"><h2><Text>{"We couldn’t refresh your favourites."}</Text></h2><p><Text error>{wishlistError}</Text></p><button className="button" onClick={() => refreshCart()}><Text>{"Try again"}</Text></button></div>;
  if (!wishlistProducts.length) return <div className="catalog-state"><Icon name="heart" size={38} /><h2><Text>{"A place for your favourites."}</Text></h2><p><Text>{"Tap the heart on a product to save it here."}</Text></p><Link className="button" href="/shop"><Text>{"Explore the shop"}</Text></Link></div>;
  return <div className="product-grid"><Text>{wishlistProducts.map(product => <ProductCard key={product._id} product={product} />)}</Text></div>;
}
