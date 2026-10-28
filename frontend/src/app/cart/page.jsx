import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import CartContents from '@/components/CartContents';
export default function CartPage() { return <main id="main" className="wrap page-content"><p className="eyebrow"><Text>{"A LITTLE FLAVOUR TO TAKE HOME"}</Text></p><h1><Text>{"Your shopping bag."}</Text></h1><CartContents /></main>; }
