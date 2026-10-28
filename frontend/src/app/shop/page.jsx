import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import Shop from '@/components/Shop';

export const metadata = { title: 'Shop Indian Spices | SON MASALA' };
export default function ShopPage({ searchParams }) {
  const q = typeof searchParams.q === 'string' ? searchParams.q.slice(0, 80) : '';
  const category = typeof searchParams.category === 'string' && /^[a-z0-9-]{1,120}$/.test(searchParams.category) ? searchParams.category : '';
  const sort = ['price-asc', 'price-desc'].includes(searchParams.sort) ? searchParams.sort : '';
  return <main id="main" className="wrap page-content"><p className="eyebrow"><Text>{"THE SON MASALA SPICE SHELF"}</Text></p><h1><Text>{"Find your flavour."}</Text></h1><p className="page-intro"><Text>{"Familiar favourites. Fresh inspiration. A little something for every kitchen."}</Text></p><Shop key={`${q}:${category}:${sort}`} initialQuery={q} initialCategory={category} initialSort={sort} /></main>;
}
