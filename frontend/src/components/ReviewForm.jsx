'use client';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import { useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '@/lib/api';
import { useStore } from './StoreProvider';

export default function ReviewForm({ productId }) {
  const { user, loading } = useStore();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    const form = event.currentTarget; const data = new FormData(form);
    try { const result = await apiRequest('reviews', { method: 'POST', body: JSON.stringify({ productId, displayName: data.get('displayName'), rating: Number(data.get('rating')), comment: data.get('comment') }) }); setMessage(result.message); form.reset(); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <section className="review-form-section"><p className="eyebrow"><Text>{"FROM YOUR KITCHEN"}</Text></p><h2><Text>{"Share your experience."}</Text></h2><Text>{loading ? <p><Text>{"Checking your account…"}</Text></p> : !user ? <p><Link className="text-link" href="/login"><Text>{"Sign in to write a review"}</Text></Link></p> : <form className="review-form" onSubmit={submit}><label><Text>{"Public display name"}</Text><input name="displayName" required minLength={2} maxLength={60} defaultValue={user.name} /></label><label><Text>{"Rating"}</Text><select name="rating" defaultValue="5"><Text>{[5, 4, 3, 2, 1].map(value => <option key={value} value={value}><Text>{value}</Text> <Text>{value === 1 ? 'star' : 'stars'}</Text></option>)}</Text></select></label><label className="full-field"><Text>{"Your review"}</Text><textarea name="comment" minLength={10} maxLength={1500} required rows={4} /></label><p><Text>{"Reviews are moderated before publication. Demo purchases do not earn a verified purchase badge."}</Text></p><button className="button" disabled={busy}><Text>{busy ? 'Submitting…' : 'Submit Review'}</Text></button><p role="status"><Text error>{message}</Text></p></form>}</Text></section>;
}
