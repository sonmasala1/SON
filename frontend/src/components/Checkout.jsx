'use client';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import { useLocale } from './LocaleProvider';
import { productName } from '@/lib/i18n';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from './StoreProvider';
import { previewCheckout, placePayLaterOrder, getCheckoutAttempt } from '@/lib/api';
import { moneyPaise } from '@/lib/catalog';
import { Totals } from './CartContents';
import { OrderDetails } from './OrderConfirmation';

const fields = [['fullName', 'Full name', 'text', 'name'], ['email', 'Email', 'email', 'email'], ['phone', 'Phone', 'tel', 'tel-national'], ['address', 'Address', 'text', 'street-address'], ['city', 'City', 'text', 'address-level2'], ['state', 'State', 'text', 'address-level1'], ['pincode', 'Pincode', 'text', 'postal-code']];
export default function Checkout() {
  const { locale } = useLocale();
  const { cartData, loading, refreshCart, user } = useStore();
  const [step, setStep] = useState(2);
  const [delivery, setDelivery] = useState({ fullName: '', email: '', phone: '', address: '', city: '', state: '', pincode: '' });
  const [preview, setPreview] = useState(null);
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState('');
  const requestKey = useRef(null), placingOrder = useRef(false), restoredUser = useRef(null);
  const router = useRouter();
  const storageKey = user ? `son-checkout-request:${user.id}` : null;
  useEffect(() => { if (!loading && !user) router.replace('/login?next=%2Fcheckout'); }, [loading, user, router]);
  useEffect(() => { if (user) setDelivery(current => ({ ...current, fullName: current.fullName || user.name || '', phone: current.phone || user.phone?.replace(/^\+91/, '') || '', email: current.email || user.email || '' })); }, [user]);
  useEffect(() => {
    if (loading || !user || restoredUser.current === user.id) return;
    restoredUser.current = user.id;
    let pending;
    try { pending = sessionStorage.getItem(storageKey); } catch { /* In-memory retries remain idempotent. */ }
    if (!pending) { setRestoring(false); return; }
    requestKey.current = pending;
    getCheckoutAttempt(pending).then(result => {
      setOrder(result.order);
      try { sessionStorage.removeItem(storageKey); } catch { /* No delivery details are stored. */ }
      void refreshCart();
    }).catch(error => {
      if ([400, 404, 410].includes(error.status)) {
        try { sessionStorage.removeItem(storageKey); } catch { /* The next submission will create a new key. */ }
        requestKey.current = null;
      } else {
        setError(error.message);
      }
    }).finally(() => setRestoring(false));
  }, [loading, user, storageKey, refreshCart]);
  async function handleFailure(error) {
    setError(error.message);
    if (error.status === 401) { await refreshCart({ clearCustomer: true }); router.replace('/login?next=%2Fcheckout'); }
    if (error.status === 409) { await refreshCart(); setStep(2); }
  }
  async function review(event) {
    event.preventDefault();
    if (placingOrder.current) return;
    placingOrder.current = true; setBusy(true); setError('');
    try { const result = await previewCheckout(delivery); setPreview(result.cart); setStep(3); }
    catch (error) { await handleFailure(error); }
    finally { placingOrder.current = false; setBusy(false); }
  }
  async function createOrder() {
    if (busy || placingOrder.current) return;
    placingOrder.current = true; setBusy(true); setError('');
    requestKey.current ||= crypto.randomUUID();
    try {
      try { sessionStorage.setItem(storageKey, requestKey.current); } catch { /* Keep the key in memory if storage is unavailable. */ }
      const result = await placePayLaterOrder({ delivery, requestKey: requestKey.current, cartVersion: preview.version, expectedTotalPaise: preview.totals.totalPaise });
      setOrder(result.order);
      try { sessionStorage.removeItem(storageKey); } catch { /* Safe to replay this key. */ }
      await refreshCart();
    } catch (error) { await handleFailure(error); }
    finally { placingOrder.current = false; setBusy(false); }
  }
  if (loading || !user || restoring) return <div className="catalog-state" role="status"><Text>Preparing your checkout…</Text></div>;
  if (order) return <OrderDetails order={order} />;
  return <>
    {error && <p className="form-error" role="alert"><Text error>{error}</Text></p>}
    {!cartData?.items.length ? <div className="catalog-state"><h2><Text>Your bag is empty.</Text></h2><Link className="button" href="/shop"><Text>Continue Shopping</Text></Link></div>
      : !cartData.valid ? <div className="catalog-state"><h2><Text>Please review your shopping bag.</Text></h2>{cartData.items.filter(item => !item.available).map(item => <p key={item._id}>{productName(item, locale)} {item.label}: requested {item.quantity}, available {item.stock}.</p>)}<Link className="button" href="/cart"><Text>Back to Cart</Text></Link></div>
      : <>
        <ol className="checkout-steps" aria-label="Checkout progress">{['Shopping Cart', 'Delivery Details', 'Order Review'].map((name, index) => <li key={name} className={step === index + 1 ? 'current' : step > index + 1 ? 'complete' : ''} aria-current={step === index + 1 ? 'step' : undefined}><span>{index + 1}</span>{index === 0 ? <Link href="/cart"><Text>{name}</Text></Link> : <Text>{name}</Text>}</li>)}</ol>
        {step === 2 && <div className="checkout-grid"><form onSubmit={review} className="delivery-form"><h2><Text>Delivery details</Text></h2><div className="delivery-fields">{fields.map(([name, label, type, autoComplete]) => <label key={name} className={name === 'address' ? 'full-field' : ''}><Text>{label}</Text><LocalizedAttrs><input name={name} type={type} autoComplete={autoComplete} value={delivery[name]} required minLength={name === 'address' ? 8 : ['fullName', 'city', 'state'].includes(name) ? 2 : undefined} maxLength={name === 'phone' ? 10 : name === 'pincode' ? 6 : name === 'address' ? 300 : name === 'email' ? 254 : 100} pattern={name === 'phone' ? '[6-9][0-9]{9}' : name === 'pincode' ? '[1-9][0-9]{5}' : undefined} inputMode={['phone', 'pincode'].includes(name) ? 'numeric' : undefined} onChange={event => setDelivery(current => ({ ...current, [name]: event.target.value }))} /></LocalizedAttrs></label>)}</div><button className="button" disabled={busy} type="submit"><Text>{busy ? 'Checking your bag…' : 'Review Order'}</Text></button></form><aside className="cart-summary"><h2><Text>Your bag</Text></h2><Totals totals={cartData.totals} /><p><Text>Totals are checked again by the store before an order is created.</Text></p></aside></div>}
        {step === 3 && preview && <div className="checkout-grid"><div className="order-review"><h2><Text>Review your order</Text></h2>{preview.items.map(item => <div key={item._id} className="review-line"><div><strong>{productName(item, locale)}</strong><p>{item.label} · <Text>Quantity</Text> {item.quantity}</p></div><span>{moneyPaise(item.lineTotalPaise)}</span></div>)}<div className="delivery-review"><h3><Text>Delivery details</Text></h3><p>{delivery.fullName}<br />{delivery.address}<br />{delivery.city}, {delivery.state} {delivery.pincode}<br />{delivery.phone} · {delivery.email}</p><button className="text-link" onClick={() => setStep(2)} disabled={busy}><Text>Edit delivery details</Text></button></div></div><aside className="cart-summary"><h2><Text>Order total</Text></h2><Totals totals={preview.totals} /><button className="button w-full" onClick={createOrder} disabled={busy}><Text>{busy ? 'Placing your order…' : 'Place Order — Pay Later'}</Text></button><p><Text>Payment arranged by our team. No online payment is taken now.</Text></p></aside></div>}
      </>}
  </>;
}
