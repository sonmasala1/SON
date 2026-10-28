'use client';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';

import Link from 'next/link';
import useProducts from '@/hooks/useProducts';
import ProductCard from './ProductCard';
import ProductGrid from './ProductGrid';
import Icon from './Icon';

export default function HomeCatalogue() {
  const offers = useProducts({ offers: 'true', limit: 8 });
  return <>
    <section className="section wrap shopping-featured"><div className="section-heading"><div><p className="eyebrow"><Text>{"THE SPICES YOU REACH FOR"}</Text></p><h2><Text>{"Featured Masalas"}</Text></h2></div><Link href="/shop" className="text-link"><Text>{"Shop all spices "}</Text><Icon size={24} /></Link></div><ProductGrid query={{ featured: 'true', limit: 4 }} shopping /></section>
    <section className="section all-products-section" id="catalogue"><div className="wrap"><div className="section-heading"><div><p className="eyebrow"><Text>{"A LITTLE FLAVOUR FOR EVERY MEAL"}</Text></p><h2><Text>{"All Masala Products"}</Text></h2></div><Link href="/shop" className="text-link"><Text>{"Explore the spice shelf "}</Text><Icon size={24} /></Link></div><ProductGrid query={{ limit: 12 }} shopping /></div></section>
    <Text error>{!offers.loading && !offers.error && offers.data?.products.length > 0 && <section className="section wrap" aria-labelledby="offers-heading"><div className="section-heading"><div><p className="eyebrow"><Text>{"A LITTLE EXTRA TO LOVE"}</Text></p><h2 id="offers-heading"><Text>{"Special Offers"}</Text></h2></div></div><div className="product-grid"><Text>{offers.data.products.map(product => <ProductCard key={product._id} product={product} />)}</Text></div></section>}</Text>
  </>;
}
