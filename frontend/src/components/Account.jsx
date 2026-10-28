'use client';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authRequest, apiRequest } from '@/lib/api';
import { useStore } from './StoreProvider';
import Link from 'next/link';
import { moneyPaise } from '@/lib/catalog';

export default function Account() {
  const { user, refreshCart, loading } = useStore();
  const router = useRouter();
  const [orders, setOrders] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const userId = user?.id;
  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [loading, user, router]);
  useEffect(() => { if (!userId) { setOrders(null); return; } let active = true; apiRequest('auth/orders').then(result => { if (active) setOrders(result.orders); }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, [userId]);
  async function signOut() { setBusy(true); try { await authRequest('logout'); await refreshCart({ clearCustomer: true }); router.replace('/login'); } catch (error) { setError(error.message); } finally { setBusy(false); } }
  async function revokeOtherSessions() { setBusy(true); setError(''); try { await authRequest('revoke-other-sessions'); } catch (error) { setError(error.message); } finally { setBusy(false); } }
  if (loading) return <div className="catalog-state" role="status"><Text>{"Loading your account…"}</Text></div>;
  if (!user) return <div className="catalog-state" role="status"><Text>{"Taking you to sign-in…"}</Text></div>;
  return <div className="account-panel"><p className="eyebrow"><Text>{"WELCOME TO YOUR KITCHEN"}</Text></p><h1><Text>{"Hello, "}</Text>{user.name}.</h1><p>{user.phone || user.email}</p><p><Text>{"Your account shopping bag is saved securely and available when you sign in again."}</Text></p><Text>{user.verificationSource === 'DEVELOPMENT_PREVIEW' && <p className="notice-box"><Text>{"Local development account · mobile delivery has not been verified."}</Text></p>}</Text><div className="account-actions"><Link href="/cart" className="button"><Text>{"Your shopping bag"}</Text></Link><button className="text-link" onClick={signOut} disabled={busy}><Text>{"Sign out"}</Text></button><button className="text-link" onClick={revokeOtherSessions} disabled={busy}><Text>{"Sign out other devices"}</Text></button></div><Text error>{error && <p role="alert" className="error-text"><Text error>{error}</Text></p>}</Text><section className="customer-order-history"><h2><Text>{"Your orders"}</Text></h2><Text>{!orders ? <p role="status"><Text>{"Loading your orders…"}</Text></p> : !orders.length ? <p><Text>{"You haven’t placed any orders yet."}</Text></p> : <ul><Text>{orders.map(order => <li key={order.id}><div><Link href={`/orders/${encodeURIComponent(order.id)}`}><Text>{order.id}</Text></Link><p><Text>{order.isDemo ? 'Demo order · ' : ''}</Text><Text>{order.paymentStatus.replaceAll('_', ' ')}</Text> · <Text>{new Date(order.createdAt).toLocaleDateString('en-IN')}</Text></p></div><strong><Text>{moneyPaise(order.totals?.totalPaise || 0)}</Text></strong></li>)}</Text></ul>}</Text></section></div>;
}
