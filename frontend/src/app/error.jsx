'use client';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';
export default function ErrorPage({ reset }) { return <main id="main" className="wrap page-content"><div className="catalog-state" role="alert"><h1><Text>{"A little kitchen interruption."}</Text></h1><p><Text>{"Something went wrong while loading this page. Please try again."}</Text></p><button className="button" onClick={reset}><Text>{"Try again"}</Text></button></div></main>; }
