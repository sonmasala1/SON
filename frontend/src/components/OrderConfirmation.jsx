'use client';
import { Text } from '@/components/LocalizedText';
import { useLocale } from './LocaleProvider';
import { productName } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getOrder, cancelOrder } from '@/lib/api';
import { moneyPaise } from '@/lib/catalog';
import { Totals } from './CartContents';
import CatalogImage from './CatalogImage';

function paymentLabel(order) {
  if (order.paymentMode === 'PAY_LATER' && order.paymentStatus === 'PENDING') return 'Pending Payment';
  if (order.paymentStatus === 'PAID') return 'Paid';
  if (order.paymentStatus === 'FAILED') return 'Failed';
  if (order.paymentStatus === 'CANCELLED') return 'Cancelled';
  return 'Pending Payment';
}

function paymentTone(order) {
  if (order.paymentStatus === 'PAID') return 'success';
  if (order.paymentStatus === 'FAILED' || order.paymentStatus === 'CANCELLED') return 'danger';
  return 'warning';
}

const fulfillmentLabels = {
  PLACED: 'Placed', CONFIRMED: 'Confirmed', PACKED: 'Packed',
  SHIPPED: 'Shipped', DELIVERED: 'Delivered', CANCELLED: 'Cancelled',
};

function fulfillmentTone(status) {
  if (status === 'DELIVERED') return 'success';
  if (status === 'CANCELLED') return 'danger';
  if (status === 'CONFIRMED') return 'blue';
  if (status === 'PACKED' || status === 'SHIPPED') return 'purple';
  return 'success';
}

export function OrderDetails({ order, onCancel, busy = false }) {
  const { locale } = useLocale();
  const [copied, setCopied] = useState(false);
  const cancelled = order.fulfillmentStatus === 'CANCELLED';
  const payment = paymentLabel(order);

  async function copyOrderId() {
    try {
      await navigator.clipboard.writeText(order.id);
    } catch {
      const input = document.createElement('textarea');
      input.value = order.id;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <>
    <section className={`confirmation-hero${cancelled ? ' is-cancelled' : ''}`}>
      {!cancelled && <div className="confirmation-check" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="M14 27l8 8 16-18" /></svg></div>}
      <p className="eyebrow"><Text>ORDER CONFIRMATION</Text></p>
      <h1><Text>{cancelled ? 'Your order has been cancelled.' : 'Your Order Has Been Placed Successfully!'}</Text></h1>
      {!cancelled && <p className="confirmation-message"><Text>Thank you for shopping with SON MASALA. Our team will contact you shortly to arrange payment and shipment.</Text></p>}
    </section>

    <section className="confirmation-status-grid" aria-label="Order status">
      <article className="confirmation-status-card confirmation-order-id">
        <span className="status-card-label"><Text>Order ID</Text></span>
        <strong>{order.id}</strong>
        <button type="button" className="copy-order-button" onClick={copyOrderId} aria-live="polite">{copied ? 'Copied!' : 'Copy'}</button>
      </article>
      <article className={`confirmation-status-card status-${paymentTone(order)}`}>
        <span className="status-card-label"><Text>Payment Status</Text></span>
        <strong><Text>{payment}</Text></strong>
      </article>
      <article className={`confirmation-status-card status-${fulfillmentTone(order.fulfillmentStatus)}`}>
        <span className="status-card-label"><Text>Order Status</Text></span>
        <strong><Text>{fulfillmentLabels[order.fulfillmentStatus] || order.fulfillmentStatus.replaceAll('_', ' ')}</Text></strong>
      </article>
    </section>

    <div className="confirmation-grid">
      <section className="confirmation-products" aria-labelledby="confirmation-products-title">
        <p className="eyebrow"><Text>{"WHAT'S IN YOUR ORDER"}</Text></p>
        <h2 id="confirmation-products-title"><Text>Your products</Text></h2>
        <div className="confirmation-product-list">
          {order.items.map(item => <article className="confirmation-product" key={String(item.variantId)}>
            <div className="confirmation-product-image">
              {item.image ? <CatalogImage src={item.image} crop={item.imageCrop} alt={productName(item, locale)} sizes="80px" /> : <span className="confirmation-image-placeholder" aria-hidden="true">✦</span>}
            </div>
            <div className="confirmation-product-copy">
              <strong>{productName(item, locale)}</strong>
              <p>{item.label}</p>
              <span><Text>Quantity</Text>: {item.quantity}</span>
            </div>
            <strong className="confirmation-product-total">{moneyPaise(item.lineTotalPaise)}</strong>
          </article>)}
        </div>
      </section>

      <aside className="confirmation-total-card">
        <p className="eyebrow"><Text>ORDER TOTAL</Text></p>
        <h2><Text>Payment summary</Text></h2>
        <Totals totals={order.totals} />
      </aside>

      <section className="confirmation-delivery">
        <p className="eyebrow"><Text>DELIVERY DETAILS</Text></p>
        <h2><Text>Shipping to</Text></h2>
        <strong>{order.delivery.fullName}</strong>
        <address>{order.delivery.address}<br />{order.delivery.city}, {order.delivery.state} {order.delivery.pincode}</address>
        <p><a href={`tel:${order.delivery.phone}`}>{order.delivery.phone}</a><br /><a href={`mailto:${order.delivery.email}`}>{order.delivery.email}</a></p>
        <div className="confirmation-pay-later">
          <span><Text>Payment method</Text></span>
          <strong><Text>{order.paymentMode === 'PAY_LATER' ? 'Pay Later' : order.paymentMode}</Text></strong>
          <p><Text>Our team will contact you shortly to arrange payment and shipment.</Text></p>
        </div>
      </section>
    </div>

    <div className="confirmation-actions">
      <Link className="button" href="/account"><Text>View My Orders</Text></Link>
      <Link className="button button-secondary" href="/shop"><Text>Continue Shopping</Text></Link>
      {onCancel && !cancelled && order.paymentStatus === 'PENDING' && !['SHIPPED', 'DELIVERED'].includes(order.fulfillmentStatus) && <button className="text-link" onClick={onCancel} disabled={busy}><Text>{busy ? 'Cancelling…' : 'Cancel order'}</Text></button>}
    </div>
  </>;
}

export default function OrderConfirmation({ id }) {
  const [order, setOrder] = useState(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0), [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; getOrder(id).then(result => { if (active) { setOrder(result.order); setError(''); } }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, [id, attempt]);
  async function cancel() {
    if (busy) return;
    setBusy(true); setError('');
    try { setOrder((await cancelOrder(id)).order); } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  return <>{error && <div className="catalog-state" role="alert"><p><Text error>{error}</Text></p><button className="button" onClick={() => setAttempt(current => current + 1)}><Text>Try again</Text></button></div>}{order ? <OrderDetails order={order} onCancel={cancel} busy={busy} /> : !error && <p className="catalog-state" role="status"><Text>Loading your order…</Text></p>}</>;
}
