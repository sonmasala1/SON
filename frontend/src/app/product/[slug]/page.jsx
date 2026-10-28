import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import ProductDetail from '@/components/ProductDetail';
import Link from 'next/link';

export default function ProductPage({ params }) {
  return <main id="main" className="wrap page-content"><Link href="/shop" className="back-link"><Text>{"← Back to the spice shelf"}</Text></Link><ProductDetail slug={params.slug} /></main>;
}
