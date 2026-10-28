'use client';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';

import { useState } from 'react';
import { subscribe } from '@/lib/api';
import Icon from './Icon';

export default function Newsletter() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setMessage('');
    try { const result = await subscribe(data.get('email'), data.get('consent') === 'on'); setMessage(result.message); form.reset(); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <section className="newsletter"><div className="wrap newsletter-inner"><div><p className="eyebrow"><Text>{"A LETTER FROM OUR KITCHEN"}</Text></p><h2><Text>{"A pinch of inspiration,"}</Text><br /><Text>{"in your inbox."}</Text></h2><p><Text>{"Recipes, kitchen stories, and news from SON MASALA."}</Text></p></div><form onSubmit={submit}><label className="sr-only" htmlFor="newsletter-email"><Text>{"Your email address"}</Text></label><div className="newsletter-input"><LocalizedAttrs><input id="newsletter-email" type="email" name="email" required maxLength={254} placeholder="Your email address" /></LocalizedAttrs><button type="submit" disabled={busy}><Text>{busy ? 'Joining…' : 'Count me in'}</Text><Icon name="arrow" size={24} /></button></div><label className="consent"><input type="checkbox" name="consent" required /><Text>{" I agree to receive recipes and brand updates by email."}</Text></label><p role="status" className="form-message"><Text error>{message}</Text></p></form></div></section>;
}
