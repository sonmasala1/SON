'use client';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';

import useProducts from '@/hooks/useProducts';
import ProductCard from './ProductCard';
import Icon from './Icon';

export default function ProductGrid({ query = {}, onPageChange, shopping = false }) {
  const { data, loading, error, retry } = useProducts(query);
  if (loading) return <LocalizedAttrs><div className="product-grid" aria-label="Loading products" role="status"><Text>{[1, 2, 3].map(item => <div className="product-skeleton" key={item}><div /><span /><span /></div>)}</Text></div></LocalizedAttrs>;
  if (error) return <div className="catalog-state" role="alert"><Icon name="leaf" size={34} /><h3><Text>{"Our spice shelf needs a moment."}</Text></h3><p><Text error>{error}</Text></p><button className="button button-outline" onClick={retry}><Text>{"Try again "}</Text><Icon name="arrow" size={24} /></button></div>;
  if (shopping && !data?.products.length) return <div className="catalog-state"><Icon name="leaf" size={30} /><h3><Text>{query.featured ? 'Featured products will appear here.' : 'No products match this selection.'}</Text></h3><p><Text>{"Explore the shop for available spices."}</Text></p></div>;
  if (!data?.products.length) return <div className="catalog-state"><div className="empty-emblem"><Icon name="leaf" size={32} /></div><p className="eyebrow"><Text>{"GOOD THINGS TAKE A LITTLE CARE"}</Text></p><h3><Text>{query.q || query.category ? 'No spices on this shelf just yet.' : 'A fresh chapter of flavour is on its way.'}</Text></h3><p><Text>{query.q || query.category ? 'Try another search or explore our other categories.' : 'Our first collection is being prepared. Explore the kitchen, find a new recipe, and join our newsletter for updates.'}</Text></p><Text>{!query.q && !query.category && <span className="coming-products"><Text>{"Haldi Powder "}</Text><i /><Text>{" Dhaniya Powder "}</Text><i /><Text>{" Lal Mirch Powder"}</Text></span>}</Text><Text>{(query.q || query.category) && <a href="/shop" className="text-link"><Text>{"Explore all products "}</Text><Icon size={24} /></a>}</Text></div>;
  return <><div className="product-grid"><Text>{data.products.map(product => <ProductCard key={product._id} product={product} />)}</Text></div><Text>{onPageChange && data.pagination.pages > 1 && <div className="pagination"><button disabled={data.pagination.page === 1} onClick={() => onPageChange(data.pagination.page - 1)}><Text>{"Previous"}</Text></button><span><Text>{"Page "}</Text><Text>{data.pagination.page}</Text><Text>{" of "}</Text><Text>{data.pagination.pages}</Text></span><button disabled={data.pagination.page >= data.pagination.pages} onClick={() => onPageChange(data.pagination.page + 1)}><Text>{"Next"}</Text></button></div>}</Text></>;
}
