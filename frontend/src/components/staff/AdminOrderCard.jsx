'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Text } from '@/components/LocalizedText';
import Icon from '@/components/Icon';
import { moneyPaise } from '@/lib/catalog';

const fulfillmentLabels = { PLACED: 'Placed', CONFIRMED: 'Confirmed', PROCESSING: 'Processing', PACKED: 'Packed', SHIPPED: 'Shipped', DELIVERED: 'Delivered', CANCELLED: 'Cancelled' };
const paymentLabels = { PENDING: 'Pending', PAID: 'Paid', FAILED: 'Failed', CANCELLED: 'Cancelled' };

function StatusBadge({ type = 'order', value }) {
  const status = String(value || '').toUpperCase();
  const label = (type === 'payment' ? paymentLabels : fulfillmentLabels)[status] || value;
  const tone = type === 'payment'
    ? (status === 'PAID' ? 'paid' : status === 'FAILED' || status === 'CANCELLED' ? 'failed' : 'pending')
    : ({ PLACED: 'placed', CONFIRMED: 'confirmed', PROCESSING: 'confirmed', PACKED: 'packed', SHIPPED: 'shipped', DELIVERED: 'delivered', CANCELLED: 'failed' }[status] || 'placed');
  return <span className={`staff-status-badge staff-status-${tone}`} aria-label={`${type === 'payment' ? 'Payment' : 'Order'} status: ${label}`}><Text>{label}</Text></span>;
}

function ProductList({ items, start = 0 }) {
  return <ol className="staff-order-product-list" start={start + 1}>
    {items.map((item, index) => <li className="staff-order-product" key={`${item.variantId || item.productId || item.name}-${start + index}`}>
      <span className="staff-order-product-name">{item.name}{item.label && <small>{item.label}</small>}</span>
      <span className="staff-order-product-quantity" aria-label={`Quantity: ${item.quantity}`}>× {item.quantity}</span>
      <strong className="staff-order-product-price">{moneyPaise(item.lineTotalPaise)}</strong>
    </li>)}
  </ol>;
}

export default function AdminOrderCard({ record, draft, state, canUpdate, onChange, onSave }) {
  const headingId = useId();
  const [copied, setCopied] = useState(false), [copyError, setCopyError] = useState('');
  const copyTimer = useRef(null);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const orderId = record.publicId || String(record._id);
  const items = record.items || [];
  const canConfirmPayment = draft.paymentStatus === 'PAID' && record.paymentStatus !== 'PAID';
  const disabled = !canUpdate || Boolean(state.saving);

  async function copyOrderId() {
    try {
      await navigator.clipboard.writeText(orderId);
      setCopyError(''); setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch { setCopyError('Unable to copy. Select the order ID and copy it manually.'); }
  }

  return <article className="staff-order-card" aria-labelledby={headingId}>
    <header className="staff-order-card-header">
      <div className="staff-order-identity">
        <span><Text>Order ID</Text></span>
        <h2 id={headingId}>{orderId}</h2>
        <button type="button" className="staff-copy-button" onClick={copyOrderId} aria-label={`Copy order ID ${orderId}`}>
          <Icon name={copied ? 'check' : 'copy'} size={16} /><span aria-live="polite"><Text>{copied ? 'Copied' : 'Copy'}</Text></span>
        </button>
      </div>
      <div className="staff-order-badges"><StatusBadge type="payment" value={record.paymentStatus} /><StatusBadge value={record.fulfillmentStatus} /></div>
    </header>

    <div className="staff-order-card-body">
      <section className="staff-order-party" aria-label="Customer details">
        <h3 className="staff-card-label"><Text>Customer</Text></h3>
        <strong>{record.delivery?.fullName || '—'}</strong>
        <p>{record.delivery?.address}{record.delivery?.city ? `, ${record.delivery.city}` : ''}{record.delivery?.pincode ? ` ${record.delivery.pincode}` : ''}</p>
        {record.delivery?.phone && <p>{record.delivery.phone}</p>}
        {record.delivery?.email && <p>{record.delivery.email}</p>}
      </section>

      <section className="staff-order-items" aria-label="Ordered products">
        <h3 className="staff-card-label"><Text>Products</Text> <span className="staff-order-item-count">({items.length})</span></h3>
        <div className="staff-order-product-preview"><ProductList items={items.slice(0, 3)} />{!items.length && <p><Text>No products available.</Text></p>}</div>
        {items.length > 3 && <details className="staff-order-more-products">
          <summary><Text>View All Products</Text> ({items.length})</summary>
          <ProductList items={items.slice(3)} start={3} />
        </details>}
      </section>

      <section className="staff-order-controls" aria-label="Order controls">
        <h3 className="staff-card-label"><Text>Update status</Text></h3>
        <label><Text>Order status</Text><select value={draft.fulfillmentStatus} onChange={event => onChange('fulfillmentStatus', event.target.value)} disabled={disabled}>
          {Object.entries(fulfillmentLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select></label>
        <label><Text>Payment status</Text><select value={draft.paymentStatus} onChange={event => onChange('paymentStatus', event.target.value)} disabled={disabled}>
          {['PENDING', 'PAID', 'FAILED', 'CANCELLED'].filter(value => value !== 'FAILED' || record.paymentStatus === 'FAILED').map(value => <option value={value} key={value}>{paymentLabels[value]}</option>)}
        </select></label>
        <div className="staff-order-confirmation-slot">{canConfirmPayment && <label className="staff-confirm-payment"><input type="checkbox" checked={draft.paymentConfirmed} onChange={event => onChange('paymentConfirmed', event.target.checked)} disabled={disabled} /><span><Text>Payment received and verified</Text></span></label>}</div>
      </section>
    </div>

    <footer className="staff-order-card-footer">
      <div className="staff-order-total"><span><Text>Order Total</Text></span><strong>{moneyPaise(record.totals?.totalPaise || 0)}</strong></div>
      <div className="staff-order-save">
        <div className="staff-order-feedback">
          {(state.error || copyError) && <p className="staff-row-error" role="alert">{state.error || copyError}</p>}
          {state.success && <p className="staff-row-success" role="status"><Icon name="check" size={17} /><Text>{state.success}</Text></p>}
        </div>
        {canUpdate && <button type="button" className="button staff-save-button" onClick={onSave} disabled={state.saving}><Text>{state.saving ? 'Saving…' : 'Save Changes'}</Text></button>}
      </div>
    </footer>
  </article>;
}
