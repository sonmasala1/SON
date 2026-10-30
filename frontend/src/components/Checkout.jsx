'use client';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import { useLocale } from './LocaleProvider';
import { productName } from '@/lib/i18n';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from './StoreProvider';
import { previewCheckout, demoPayment, getOrder } from '@/lib/api';
import { moneyPaise } from '@/lib/catalog';
import { Totals } from './CartContents';
import Icon from './Icon';

const fields = [['fullName', 'Full name', 'text', 'name'], ['email', 'Email', 'email', 'email'], ['phone', 'Phone', 'tel', 'tel-national'], ['address', 'Address', 'text', 'street-address'], ['city', 'City', 'text', 'address-level2'], ['state', 'State', 'text', 'address-level1'], ['pincode', 'Pincode', 'text', 'postal-code']];
export default function Checkout() {
  const { locale } = useLocale();
  const { cartData, loading, refreshCart, user } = useStore();
  const demoEnabled = Boolean(cartData?.demoCheckoutEnabled);
  const [step, setStep] = useState(2);
  const [delivery, setDelivery] = useState({ fullName: '', email: '', phone: '', address: '', city: '', state: '', pincode: '' });
  const [preview, setPreview] = useState(null);
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState('');
  const requestKey = useRef(null);
  const restoringOnce = useRef(false);
  const router = useRouter();
  useEffect(() => { if (!loading && !user) router.replace('/login?next=%2Fcheckout'); }, [loading, user, router]);
  useEffect(() => { if (user) setDelivery(current => ({ ...current, fullName: current.fullName || user.name || '', phone: current.phone || user.phone?.replace(/^\+91/, '') || '', email: current.email || user.email || '' })); }, [user]);
  useEffect(() => {
    if (loading || !user || restoringOnce.current) return;
    restoringOnce.current = true;
    if (!demoEnabled) { setRestoring(false); return; }
    let id;
    try { id = sessionStorage.getItem('son-demo-pending-order'); } catch { /* No persistent delivery data. */ }
    if (!id) { setRestoring(false); return; }
    getOrder(id).then(result => {
      if (result.order.paymentStatus !== 'PENDING') { sessionStorage.removeItem('son-demo-pending-order'); return; }
      setOrder(result.order); setStep(4);
    }).catch(error => { setError(error.message); }).finally(() => setRestoring(false));
  }, [loading, user, demoEnabled]);
  async function handleFailure(error) {
    setError(error.message);
    if (error.status === 401) { await refreshCart({ clearCustomer: true }); router.replace('/login?next=%2Fcheckout'); }
  }
  async function review(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await previewCheckout(delivery); setPreview(result.cart); setStep(3); }
    catch (error) { await handleFailure(error); await refreshCart(); }
    finally { setBusy(false); }
  }
  async function createOrder() {
    if (!demoEnabled || busy) return;
    setBusy(true); setError('');
    requestKey.current ||= crypto.randomUUID();
    try {
      const result = await demoPayment({ action: 'create', delivery, requestKey: requestKey.current });
      if (result.order.paymentStatus !== 'PENDING') { router.push(`/orders/${result.order.id}`); return; }
      setOrder(result.order); setStep(4);
      try { sessionStorage.setItem('son-demo-pending-order', result.order.id); } catch { /* In-memory state remains usable. */ }
    } catch (error) { await handleFailure(error); }
    finally { setBusy(false); }
  }
  async function simulate(outcome) {
    setBusy(true); setError('');
    try {
      const result = await demoPayment({ action: 'simulate', orderId: order.id, outcome });
      try { sessionStorage.removeItem('son-demo-pending-order'); } catch { /* No customer details are stored. */ }
      await refreshCart(); router.push(`/orders/${result.order.id}`);
    } catch (error) { await handleFailure(error); }
    finally { setBusy(false); }
  }
  if (loading || !user || restoring) return <div className="catalog-state" role="status"><Text>{"Preparing your checkout…"}</Text></div>;
  if (!order && !cartData?.items.length) return <div className="catalog-state"><h2><Text>{"Your bag is empty."}</Text></h2><p><Text>{"Add a spice before starting checkout."}</Text></p><Link className="button" href="/shop"><Text>{"Continue Shopping"}</Text></Link></div>;
  if (!order && !cartData.valid) return <div className="catalog-state"><h2><Text>{"Let’s review your shopping bag."}</Text></h2><p><Text>{'Please adjust unavailable quantities before checkout.'}</Text></p><Link className="button" href="/cart"><Text>{"Back to Cart"}</Text></Link></div>;
  return <><LocalizedAttrs><ol className="checkout-steps" aria-label="Checkout progress"><Text>{(demoEnabled ? ['Shopping Cart', 'Delivery Details', 'Order Review', 'Demo Payment', 'Confirmation'] : ['Shopping Cart', 'Delivery Details', 'Order Review']).map((name, index) => <li key={name} className={step === index + 1 ? 'current' : step > index + 1 ? 'complete' : ''} aria-current={step === index + 1 ? 'step' : undefined}><span><Text>{index + 1}</Text></span><Text>{index === 0 ? <Link href="/cart"><Text>{name}</Text></Link> : name}</Text></li>)}</Text></ol></LocalizedAttrs>{demoEnabled && <div className="demo-checkout-banner"><Icon name="check" size={22} /><div><strong><Text>{"DEMO CHECKOUT"}</Text></strong><p><Text>{"Use sample delivery details. This is a test order and no real shipment will be created."}</Text></p></div></div>}<Text error>{error && <p className="form-error" role="alert"><Text error>{error}</Text></p>}</Text>
    <Text>{step === 2 && <div className="checkout-grid"><form onSubmit={review} className="delivery-form"><p className="eyebrow"><Text>{"STEP 2 · WHERE WOULD IT GO?"}</Text></p><h2><Text>{"Delivery details"}</Text></h2><div className="delivery-fields"><Text>{fields.map(([name, label, type, autoComplete]) => <label key={name} className={name === 'address' ? 'full-field' : ''}><Text>{label}</Text><LocalizedAttrs><input name={name} type={type} autoComplete={autoComplete} value={delivery[name]} required minLength={name === 'address' ? 8 : ['fullName', 'city', 'state'].includes(name) ? 2 : undefined} maxLength={name === 'phone' ? 10 : name === 'pincode' ? 6 : name === 'address' ? 300 : name === 'email' ? 254 : 100} pattern={name === 'phone' ? '[6-9][0-9]{9}' : name === 'pincode' ? '[1-9][0-9]{5}' : undefined} title={name === 'phone' ? 'A 10-digit Indian mobile number starting with 6, 7, 8, or 9' : name === 'pincode' ? 'A six-digit Indian pincode' : undefined} inputMode={['phone', 'pincode'].includes(name) ? 'numeric' : undefined} onChange={event => setDelivery(current => ({ ...current, [name]: event.target.value }))} /></LocalizedAttrs></label>)}</Text></div><button className="button" disabled={busy} type="submit"><Text>{busy ? 'Checking your bag…' : 'Review Order'}</Text> <Icon size={24} /></button></form><aside className="cart-summary"><h2><Text>{"Your bag"}</Text></h2><Totals totals={cartData.totals} demo={demoEnabled} /><p><Text>{"Totals are checked again by the store before an order is created."}</Text></p></aside></div>}</Text>
    <Text>{step === 3 && <div className="checkout-grid"><div className="order-review"><p className="eyebrow"><Text>{"STEP 3 · ONE LAST LOOK"}</Text></p><h2><Text>{demoEnabled ? 'Review your demo order' : 'Review your order'}</Text></h2><Text>{preview.items.map(item => <div key={item._id} className="review-line"><div><strong><Text>{productName(item, locale)}</Text></strong><p><Text>{item.label}</Text><Text>{" · Quantity "}</Text><Text>{item.quantity}</Text></p></div><span><Text>{moneyPaise(item.lineTotalPaise)}</Text></span></div>)}</Text><div className="delivery-review"><h3><Text>{"Delivery details"}</Text></h3><p>{delivery.fullName}<br />{delivery.address}<br />{delivery.city}, {delivery.state} {delivery.pincode}<br />{delivery.phone} · {delivery.email}</p><button className="text-link" onClick={() => setStep(2)} disabled={busy}><Text>{"Edit delivery details"}</Text></button></div></div><aside className="cart-summary"><h2><Text>{demoEnabled ? 'Demo order total' : 'Order total'}</Text></h2><Totals totals={preview.totals} demo={demoEnabled} />{demoEnabled && <button className="button w-full" onClick={createOrder} disabled={busy}><Text>{busy ? 'Reserving your demo order…' : 'Continue to Demo Payment'}</Text></button>}<p><Text>{demoEnabled ? 'Demo stock is reserved for 10 minutes. No real payment is collected.' : 'Online payment is not configured. Your order has not been placed.'}</Text></p></aside></div>}</Text>
    <Text>{step === 4 && order && <section className="demo-payment-panel"><p className="eyebrow"><Text>{"STEP 4 · CHOOSE A TEST OUTCOME"}</Text></p><h2><Text>{"DEMO PAYMENT — NO REAL MONEY WILL BE CHARGED"}</Text></h2><p><Text>{"No card number, CVV, OTP, banking PIN, or UPI PIN is required."}</Text></p><div className="demo-payment-order"><span><Text>{"Demo Order ID"}</Text></span><strong><Text>{order.id}</Text></strong><span><Text>{"Total"}</Text></span><strong><Text>{moneyPaise(order.totals.totalPaise)}</Text></strong></div><div className="demo-payment-actions"><button className="button" disabled={busy} onClick={() => simulate('PAID_DEMO')}><Text>{"Simulate Successful Payment "}</Text><Icon name="check" size={24} /></button><button className="button button-failure" disabled={busy} onClick={() => simulate('FAILED')}><Text>{"Simulate Failed Payment"}</Text></button><button className="button button-outline" disabled={busy} onClick={() => simulate('CANCELLED')}><Text>{"Simulate Cancelled Payment"}</Text></button></div><p role="status"><Text>{busy ? 'Saving the demo payment result…' : 'The result is saved to the test database only. No shipment, invoice, or customer payment notification will be triggered.'}</Text></p></section>}</Text>
  </>;
}
