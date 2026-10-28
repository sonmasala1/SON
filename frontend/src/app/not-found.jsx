import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import Link from 'next/link';
export default function NotFound() { return <main id="main" className="wrap page-content"><div className="catalog-state"><p className="eyebrow"><Text>{"404 · A LITTLE OFF THE SPICE TRAIL"}</Text></p><h1><Text>{"This page isn’t in our recipe book."}</Text></h1><p><Text>{"Let’s find our way back to something delicious."}</Text></p><Link className="button" href="/"><Text>{"Back home"}</Text></Link></div></main>; }
