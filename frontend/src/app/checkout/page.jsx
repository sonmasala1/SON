import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import Checkout from '@/components/Checkout';
export const metadata = { title: 'Checkout | SON MASALA' };
export default function CheckoutPage() { return <main id="main" className="wrap page-content"><p className="eyebrow"><Text>{"COMPLETE YOUR ORDER"}</Text></p><h1><Text>{"Checkout"}</Text></h1><Checkout /></main>; }
