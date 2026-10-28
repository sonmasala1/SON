'use client';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import { useLocale } from './LocaleProvider';
import { productName } from '@/lib/i18n';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getReviews } from '@/lib/api';
import Icon from './Icon';

export default function ReviewsSlider() {
  const { locale } = useLocale();
  const [reviews, setReviews] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const touch = useRef(null);
  const refresh = useCallback(async () => {
    try { const result = await getReviews(); setReviews(result.reviews); setIndex(current => result.reviews.length ? current % result.reviews.length : 0); setError(''); }
    catch (error) { setError(error.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 30000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => { const media = window.matchMedia('(prefers-reduced-motion: reduce)'); const change = () => setReducedMotion(media.matches); change(); media.addEventListener('change', change); return () => media.removeEventListener('change', change); }, []);
  useEffect(() => {
    if (reviews.length < 2 || hover || focus || reducedMotion || manuallyPaused) return;
    const timer = setInterval(() => setIndex(current => (current + 1) % reviews.length), 4500);
    return () => clearInterval(timer);
  }, [reviews.length, hover, focus, reducedMotion, manuallyPaused]);
  function move(amount) { setIndex(current => (current + amount + reviews.length) % reviews.length); }
  return <section className="reviews-section section" aria-labelledby="reviews-heading"><div className="wrap"><div className="review-heading"><p className="eyebrow"><Text>{"FROM KITCHENS LIKE YOURS"}</Text></p><h2 id="reviews-heading"><Text>{"What Our Customers Say"}</Text></h2><LocalizedAttrs><p lang="hi"><Text>{"हमारे ग्राहकों की राय"}</Text></p></LocalizedAttrs></div><Text error>{loading ? <p className="reviews-empty" role="status"><Text>{"Loading customer feedback…"}</Text></p> : error && !reviews.length ? <div className="reviews-empty" role="alert"><p><Text>{"Customer feedback is temporarily unavailable."}</Text></p><button className="text-link" onClick={refresh}><Text>{"Try again"}</Text></button></div> : !reviews.length ? <div className="reviews-empty"><Icon name="heart" size={30} /><h3><Text>{"Be the first to review SON MASALA."}</Text></h3><p><Text>{"Your kitchen stories belong here. Sign in and share a review from a product page."}</Text></p></div> : <LocalizedAttrs><div className="reviews-carousel" data-paused={hover || focus || reducedMotion || manuallyPaused ? "true" : "false"} role="region" aria-roledescription="carousel" aria-label="Customer feedback" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocusCapture={() => setFocus(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocus(false); }} onTouchStart={event => { touch.current = event.touches[0].clientX; }} onTouchEnd={event => { const delta = event.changedTouches[0].clientX - touch.current; if (touch.current !== null && Math.abs(delta) > 45) move(delta < 0 ? 1 : -1); touch.current = null; }}><div className="review-window"><div className="review-track" style={{ transform: `translateX(-${index * 100}%)` }}><Text>{reviews.map((review, position) => <LocalizedAttrs key={review._id}><article className="review-slide" key={review._id} aria-roledescription="slide" aria-label={`${position + 1} of ${reviews.length}`} aria-hidden={position !== index}><LocalizedAttrs><div className="review-stars" aria-label={`${review.rating} out of 5 stars`}><Text>{'★'.repeat(review.rating)}</Text><span><Text>{'☆'.repeat(5 - review.rating)}</Text></span></div></LocalizedAttrs><blockquote>“{review.comment}”</blockquote><strong>{review.displayName}</strong><Text>{review.verifiedPurchase && <span className="verified-badge"><Icon name="check" size={24} /><Text>{" Verified purchase"}</Text></span>}</Text><p><Text>{review.productId ? productName(review.productId, locale) : ""}</Text> · <time dateTime={review.createdAt}><Text>{new Date(review.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text></time></p></article></LocalizedAttrs>)}</Text></div></div><Text>{reviews.length > 1 && <div className="review-controls"><LocalizedAttrs><button className="icon-button review-prev" onClick={() => move(-1)} aria-label="Previous review">←</button></LocalizedAttrs><div className="review-dots"><Text>{reviews.map((review, position) => <LocalizedAttrs key={review._id}><button key={review._id} onClick={() => setIndex(position)} aria-label={`Show review ${position + 1}`} aria-current={position === index ? 'true' : undefined} /></LocalizedAttrs>)}</Text></div><LocalizedAttrs><button className="icon-button" onClick={() => move(1)} aria-label="Next review">→</button></LocalizedAttrs><Text>{!reducedMotion && <button className="text-link" onClick={() => setManuallyPaused(!manuallyPaused)}><Text>{manuallyPaused ? 'Play reviews' : 'Pause reviews'}</Text></button>}</Text></div>}</Text></div></LocalizedAttrs>}</Text></div></section>;
}
