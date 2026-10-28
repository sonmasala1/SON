import OrderConfirmation from '@/components/OrderConfirmation';
export const metadata = { title: 'Demo Order | SON MASALA', robots: { index: false, follow: false } };
export default function OrderPage({ params }) { return <main id="main" className="wrap page-content"><OrderConfirmation id={params.id} /></main>; }
