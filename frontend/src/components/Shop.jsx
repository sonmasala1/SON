'use client';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCategories } from '@/lib/api';
import { useLocale } from './LocaleProvider';
import ProductGrid from './ProductGrid';
import Icon from './Icon';

export default function Shop({ initialQuery = '', initialCategory = '', initialSort = '' }) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [sort, setSort] = useState(initialSort);
  const [search, setSearch] = useState(initialQuery);
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState([]);
  const [categoryError, setCategoryError] = useState('');
  const router = useRouter();
  const { locale } = useLocale();
  useEffect(() => {
    const controller = new AbortController();
    getCategories({ signal: controller.signal }).then(result => {
      setCategories(result.categories || []);
      setCategoryError('');
    }).catch(error => {
      if (!controller.signal.aborted) setCategoryError(error.message);
    });
    return () => controller.abort();
  }, []);
  function filter(nextQuery, nextCategory, nextSort) {
    setQuery(nextQuery); setCategory(nextCategory); setSort(nextSort); setPage(1);
    const params = new URLSearchParams();
    if (nextQuery) params.set('q', nextQuery);
    if (nextCategory) params.set('category', nextCategory);
    if (nextSort) params.set('sort', nextSort);
    router.replace(`/shop${params.size ? `?${params}` : ''}`, { scroll: false });
  }
  return <><div className="shop-toolbar" id="categories"><form onSubmit={event => { event.preventDefault(); filter(search.trim(), category, sort); }}><Icon name="search" /><label className="sr-only" htmlFor="shop-search"><Text>{"Search products"}</Text></label><LocalizedAttrs><input id="shop-search" type="search" value={search} onChange={event => setSearch(event.target.value)} maxLength={80} placeholder="Search your favourite spice" /></LocalizedAttrs><button className="button button-small" type="submit"><Text>{"Search"}</Text></button></form><label className="category-filter"><Text>{"Category"}</Text><LocalizedAttrs><select aria-label="Category" value={category} onChange={event => filter(query, event.target.value, sort)}><option value=""><Text>{"All spices"}</Text></option><Text>{categories.map(item => <option key={item.slug} value={item.slug}>{locale === 'hi' && item.hindiName ? item.hindiName : item.name}</option>)}</Text></select></LocalizedAttrs></label><label className="category-filter"><Text>{"Sort by price"}</Text><LocalizedAttrs><select aria-label="Sort by price" value={sort} onChange={event => filter(query, category, event.target.value)}><option value=""><Text>{"Featured"}</Text></option><option value="price-asc"><Text>{"Price: low to high"}</Text></option><option value="price-desc"><Text>{"Price: high to low"}</Text></option></select></LocalizedAttrs></label></div><Text>{categoryError && <p className="form-error" role="alert"><Text error>{categoryError}</Text></p>}</Text><Text>{query && <p className="search-label"><Text>{"Results for “"}</Text><Text>{query}</Text>”</p>}</Text><ProductGrid query={{ q: query, category, page, sort, limit: 48 }} onPageChange={setPage} shopping /></>;
}
