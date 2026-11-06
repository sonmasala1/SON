'use client';
import { Text } from '@/components/LocalizedText';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { apiRequest } from '@/lib/api';
import { useStore } from './StoreProvider';

export default function ReviewForm({ productId }) {
  const { user, loading } = useStore();
  const pathname = usePathname();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [rating, setRating] = useState(5);
  const verified = user?.emailVerified || user?.phoneVerified;
  async function submit(event) {
    event.preventDefault();
    if (submitting.current || submitted || !verified) return;
    const data = new FormData(event.currentTarget);
    submitting.current = true; setBusy(true); setMessage(''); setFailed(false);
    try {
      const result = await apiRequest('reviews', { method: 'POST', body: JSON.stringify({ productId, displayName: data.get('displayName'), rating: Number(data.get('rating')), comment: data.get('comment') }) });
      setMessage(result.message); setSubmitted(true);
    } catch (error) { setMessage(error.message); setFailed(true); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <section id="write-review" className="review-form-section" aria-labelledby="review-form-heading">
    <p className="eyebrow"><Text>FROM YOUR KITCHEN</Text></p>
    <h2 id="review-form-heading"><Text>Share your experience.</Text></h2>
    <p id="review-policy"><Text>Reviews are moderated before publication. Verified purchase badges require a confirmed payment.</Text></p>
    {loading ? <p role="status"><Text>Checking your account…</Text></p> : !user || !verified ? <p>
      {user && <Text>Verify your email or mobile number before submitting a review.</Text>}{' '}
      <Link className="text-link" href={`/login?next=${encodeURIComponent(`${pathname}#write-review`)}`}><Text>Sign in to write a review</Text></Link>
    </p> : <form className="review-form" onSubmit={submit} aria-describedby="review-policy" aria-busy={busy}>
      <fieldset disabled={busy || submitted}>
        <legend className="sr-only"><Text>Share your experience.</Text></legend>
        <label><Text>Public display name</Text><input name="displayName" required minLength={2} maxLength={60} defaultValue={user.name} autoComplete="nickname" /></label>
        <div className="review-rating" role="group" aria-labelledby="review-rating-label"><span id="review-rating-label"><Text>Rating</Text></span><div className="review-rating-stars">{[1, 2, 3, 4, 5].map(value => <label key={value} className={value <= rating ? 'is-selected' : ''}><input className="sr-only" type="radio" name="rating" value={value} required checked={rating === value} onChange={() => setRating(value)} /><span aria-hidden="true">{value <= rating ? '★' : '☆'}</span><span className="sr-only">{value} <Text>{value === 1 ? 'star' : 'stars'}</Text></span></label>)}</div></div>
        <label className="full-field"><Text>Your review</Text><textarea name="comment" minLength={10} maxLength={1500} required rows={5} /></label>
        <button className="button" type="submit"><Text>{busy ? 'Submitting…' : 'Submit Review'}</Text></button>
      </fieldset>
      <p role={failed ? 'alert' : 'status'} className={failed ? 'form-error' : ''}><Text error={failed}>{message}</Text></p>
    </form>}
  </section>;
}
