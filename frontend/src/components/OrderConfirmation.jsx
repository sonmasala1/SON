'use client';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import { useLocale } from './LocaleProvider';
import { productName } from '@/lib/i18n';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getOrder } from '@/lib/api';
import { moneyPaise } from '@/lib/catalog';
import { Totals } from './CartContents';
import Icon from './Icon';

export default function OrderConfirmation({ id }) {
  const { locale } = useLocale();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { let active = true; getOrder(id).then(result => { if (active) { setOrder(result.order); setError(''); } }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, [id, attempt]);
  if (error) return <div className="catalog-state" role="alert"><h1><Text>{"We couldn’t open this demo order."}</Text></h1><p><Text error>{error}</Text></p><button className="button" onClick={() => setAttempt(current => current + 1)}><Text>{"Try again"}</Text></button></div>;
  if (!order) return <p className="catalog-state" role="status"><Text>{"Loading your demo order…"}</Text></p>;
  const paid = order.paymentStatus === 'PAID_DEMO';
  const title = paid ? 'Your Demo Order Has Been Placed!' : order.paymentStatus === 'FAILED' ? 'Demo payment failed.' : order.paymentStatus === 'CANCELLED' ? 'Demo payment cancelled.' : 'Your demo payment is pending.';
  return <><div className={`order-confirmation-title ${paid ? 'is-paid' : ''}`}><Icon name={paid ? 'check' : 'clock'} size={46} /><p className="eyebrow"><Text>{paid ? 'STEP 5 · DEMO CONFIRMATION' : 'DEMO PAYMENT RESULT'}</Text></p><h1><Text>{title}</Text></h1><p><Text>{paid ? 'You’ve completed a demonstration order. No real money was charged and no delivery will be made.' : 'No money was charged. Your shopping bag is available if you’d like to try again.'}</Text></p><span className="payment-status"><Text>{order.paymentStatus}</Text></span><p className="demo-order-id"><Text>{order.id}</Text></p></div><div className="checkout-grid"><section className="order-review"><h2><Text>{"Your demo items"}</Text></h2><Text>{order.items.map(item => <div className="review-line" key={item._id}><div><strong><Text>{productName(item, locale)}</Text></strong><p><Text>{item.label}</Text><Text>{" · Quantity "}</Text><Text>{item.quantity}</Text></p></div><span><Text>{moneyPaise(item.lineTotalPaise)}</Text></span></div>)}</Text><div className="delivery-review"><h3><Text>{"Delivery details"}</Text></h3><p>{order.delivery.fullName}<br />{order.delivery.address}<br />{order.delivery.city}, {order.delivery.state} {order.delivery.pincode}<br />{order.delivery.phone}<br />{order.delivery.email}</p></div></section><aside className="cart-summary"><h2><Text>{"Demo total"}</Text></h2><Totals totals={order.totals} demo /><p><Text>{"Payment mode: "}</Text><Text>{order.paymentMode}</Text></p><Link className="button w-full" href="/shop"><Text>{"Continue Shopping"}</Text></Link><Text>{!paid && <Link href={order.paymentStatus === 'PENDING' ? '/checkout' : '/cart'} className="details-link"><Text>{order.paymentStatus === 'PENDING' ? 'Return to demo payment' : 'Return to your bag'}</Text></Link>}</Text></aside></div></>;
}
