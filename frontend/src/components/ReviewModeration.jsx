'use client';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import { useCallback, useEffect, useState } from 'react';
import { useStaff } from './staff/StaffSession';


export default function ReviewModeration() {
  const { account, request } = useStaff();
  const [reviews, setReviews] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setReviews((await request('admin/reviews')).reviews); setError(''); } catch (error) { setError(error.message); } }, [request]);
  useEffect(() => { void load(); }, [load]);
  async function moderate(review, approved) { setBusy(true); try { await request(`admin/reviews/${review._id}`, { method: 'PATCH', body: JSON.stringify({ approved }) }); await load(); } catch (error) { setError(error.message); } finally { setBusy(false); } }
  return <><p className="eyebrow"><Text>{"ADMINISTRATION"}</Text></p><h1><Text>{"Review moderation"}</Text></h1><p className="page-intro"><Text>{"Publish only genuine, appropriate customer feedback. Approval does not change verified purchase status."}</Text></p><Text error>{error && <p className="error-text" role="alert"><Text error>{error}</Text></p>}</Text><button className="text-link" onClick={load}><Text>{"Refresh reviews"}</Text></button><Text>{!reviews.length && <p className="catalog-state"><Text>{"No reviews are waiting for moderation."}</Text></p>}</Text><div className="moderation-list"><Text>{reviews.map(review => <article key={review._id}><div><strong>{review.displayName} · <Text>{review.rating}</Text>/5</strong><p><Text>{review.productId?.name}</Text> · <Text>{new Date(review.createdAt).toLocaleDateString('en-IN')}</Text></p><p className="moderation-comment">{review.comment}</p><span><Text>{review.approved ? 'Approved' : 'Not published'}</Text> · <Text>{review.verifiedPurchase ? 'Verified purchase' : 'Unverified'}</Text></span></div><Text>{account.permissions.includes('reviews.moderate') && <button className="button button-outline" disabled={busy} onClick={() => moderate(review, !review.approved)}><Text>{review.approved ? 'Unpublish' : 'Approve Review'}</Text></button>}</Text></article>)}</Text></div></>;
}
