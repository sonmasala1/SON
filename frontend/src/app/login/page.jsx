import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import CustomerOtpLogin from '@/components/CustomerOtpLogin';
import { Suspense } from 'react';
export const metadata = { title: 'Welcome to SON MASALA | Sign In', robots: { index: false, follow: true } };
export default function LoginPage() { return <main id="main" className="customer-auth-page"><Suspense fallback={<div className="customer-auth-loading" role="status"><Text>{"Checking your session…"}</Text></div>}><CustomerOtpLogin /></Suspense></main>; }
