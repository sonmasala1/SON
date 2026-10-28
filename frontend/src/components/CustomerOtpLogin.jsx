'use client';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { apiRequest } from '@/lib/api';
import { useStore } from './StoreProvider';
import { Brand } from './Header';
import { customerReturnPath, mobileDigits, normalizeName, validMobile, validName, googleLoginError } from '@/lib/customer-auth';

export default function CustomerOtpLogin() {
  const { user, loading, refreshCart } = useStore();
  const router = useRouter(), search = useSearchParams();
  const destination = customerReturnPath(search.get('next') || search.get('returnTo'));
  const [fullName, setFullName] = useState(''), [mobile, setMobile] = useState(''), [channel, setChannel] = useState('sms');
  const [challenge, setChallenge] = useState(null), [digits, setDigits] = useState(Array(6).fill(''));
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [now, setNow] = useState(Date.now()), [retryUntil, setRetryUntil] = useState(0);
  const inputs = useRef([]), heading = useRef(null);
  const code = digits.join('');
  const serverNow = now + (challenge?.clockOffset || 0);
  const expires = challenge ? Math.max(0, Math.ceil((Date.parse(challenge.expiresAt) - serverNow) / 1000)) : 0;
  const resend = challenge ? Math.max(0, Math.ceil((Math.max(Date.parse(challenge.resendAt) - (challenge.clockOffset || 0), retryUntil) - now) / 1000)) : 0;
  useEffect(() => { if (!loading && user) router.replace(destination); }, [loading, user, router, destination]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (challenge) inputs.current[0]?.focus(); }, [challenge]);
  useEffect(() => { const message = googleLoginError(search.get('google_error')); if (message) setError(message); }, [search]);
  function report(error) { setError(error.message.replace(/^HTTP \d+: /, '')); if (error.retryAfter) setRetryUntil(Date.now() + error.retryAfter * 1000); }
  async function acceptChallenge(result) {
    if (result.authenticated) { await refreshCart(); router.replace(destination); return; }
    setChallenge({ ...result, clockOffset: Date.parse(result.serverTime) - Date.now() }); setDigits(Array(6).fill('')); setNow(Date.now()); setRetryUntil(0);
  }
  async function submit(event) {
    event.preventDefault(); if (busy) return; setError('');
    if (!challenge) {
      if (!validName(fullName) || !validMobile(mobile)) return;
      setBusy('send');
      try { await acceptChallenge(await apiRequest('auth/send-otp', { method: 'POST', timeout: 20000, body: JSON.stringify({ fullName: normalizeName(fullName), phone: `+91${mobile}`, channel }) })); }
      catch (error) { report(error); } finally { setBusy(''); }
    } else {
      if (code.length !== 6 || !expires) return;
      setBusy('verify');
      try { await apiRequest('auth/verify-otp', { method: 'POST', timeout: 20000, body: JSON.stringify({ challengeToken: challenge.challengeToken, code }) }); setDigits(Array(6).fill('')); await refreshCart(); router.replace(destination); }
      catch (error) { report(error); } finally { setBusy(''); }
    }
  }
  async function resendCode() {
    if (busy || resend > 0) return; setBusy('resend'); setError('');
    try { await acceptChallenge(await apiRequest('auth/resend-otp', { method: 'POST', timeout: 20000, body: JSON.stringify({ challengeToken: challenge.challengeToken }) })); }
    catch (error) { report(error); } finally { setBusy(''); }
  }
  function enterDigits(index, value) {
    const numbers = value.replace(/\D/g, '').slice(0, 6); if (!numbers) { setDigits(current => current.map((digit, position) => position === index ? '' : digit)); return; }
    const start = numbers.length === 6 ? 0 : index;
    setDigits(current => { const result = [...current]; for (let offset = 0; offset < numbers.length && start + offset < 6; offset++) result[start + offset] = numbers[offset]; return result; });
    inputs.current[Math.min(5, start + numbers.length)]?.focus(); setError('');
  }
  async function continueWithGoogle() {
    if (busy) return; setBusy('google'); setError('');
    try {
      const result = await apiRequest('auth/google/start', { method: 'POST', body: JSON.stringify({ returnTo: destination }) });
      if (result.authenticated) { await refreshCart(); router.replace(destination); return; }
      const authorization = new URL(result.authorizationUrl);
      if (authorization.protocol !== 'https:' || authorization.origin !== 'https://accounts.google.com') throw new Error('Google sign-in is currently unavailable. Please use mobile OTP.');
      window.location.assign(authorization.toString());
    } catch (error) { report(error); setBusy(''); }
  }
  if (loading || user) return <div className="customer-auth-loading" role="status"><Text>{user ? 'Taking you to your account…' : 'Checking your session…'}</Text></div>;
  return <><div className="customer-auth-stage"><section className="customer-auth-card" aria-labelledby="customer-auth-heading" aria-busy={Boolean(busy)}>
    <div className="customer-auth-brand"><Brand /></div>
    <div className="customer-auth-intro" key={challenge ? 'verify' : 'welcome'}>
      <h1 id="customer-auth-heading" ref={heading} tabIndex={-1}><Text>{challenge ? <><Text>{"Verify Your"}</Text><br /><Text>{"Mobile Number"}</Text></> : <><Text>{"Welcome to"}</Text><br /><Text>{"SON MASALA"}</Text></>}</Text></h1>
      <p><Text>{challenge ? <><Text>{"Enter the 6-digit verification code "}</Text><Text>{challenge.developmentCode ? 'for' : 'sent to'}</Text><br /><strong>+91 <Text>{challenge.phone.slice(3, 8)}</Text> <Text>{challenge.phone.slice(8)}</Text></strong></> : 'Sign in or join us to explore authentic Indian spices'}</Text></p>
    </div>
    <form className="customer-auth-form" onSubmit={submit}>
      <Text>{!challenge ? <>
        <div className="customer-auth-field"><label htmlFor="customer-full-name"><Text>{"FULL NAME"}</Text></label><LocalizedAttrs><input id="customer-full-name" name="fullName" value={fullName} onChange={event => setFullName(event.target.value)} onBlur={() => setFullName(normalizeName(fullName))} autoComplete="name" placeholder="Enter your full name" minLength={2} maxLength={100} required disabled={Boolean(busy)} /></LocalizedAttrs></div>
        <div className="customer-auth-field"><label htmlFor="customer-mobile"><Text>{"MOBILE NUMBER"}</Text></label><div className="customer-mobile-field"><span aria-hidden="true">+91</span><LocalizedAttrs><input id="customer-mobile" name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" value={mobile} onChange={event => setMobile(mobileDigits(event.target.value))} placeholder="Enter 10-digit mobile number" pattern="[6-9][0-9]{9}" maxLength={20} required aria-describedby="mobile-format" disabled={Boolean(busy)} /></LocalizedAttrs></div><span id="mobile-format" className="sr-only"><Text>{"Indian mobile number. Country code +91. Ten digits, starting with 6, 7, 8, or 9."}</Text></span></div>
        <fieldset className="customer-otp-channels"><legend><Text>{"Receive verification code via"}</Text></legend><div><Text>{[['sms', 'SMS OTP'], ['whatsapp', 'WhatsApp OTP']].map(([value, label]) => <label className={channel === value ? 'is-selected' : ''} key={value}><input type="radio" name="channel" value={value} checked={channel === value} onChange={() => setChannel(value)} disabled={Boolean(busy)} /><span><Text>{label}</Text></span></label>)}</Text></div></fieldset>
      </> : <>
        <fieldset className="customer-otp-fields"><legend><Text>{"VERIFICATION CODE"}</Text></legend><div className="customer-otp-digits"><Text>{digits.map((digit, index) => <LocalizedAttrs key={index}><input key={index} ref={element => { inputs.current[index] = element; }} aria-label={`Verification code digit ${index + 1}`} type="text" inputMode="numeric" autoComplete={index === 0 ? 'one-time-code' : 'off'} pattern="[0-9]" maxLength={6} value={digit} disabled={Boolean(busy)} required onFocus={event => event.target.select()} onChange={event => enterDigits(index, event.target.value)} onPaste={event => { event.preventDefault(); enterDigits(index, event.clipboardData.getData('text')); }} onKeyDown={event => { if (event.key === 'Backspace' && !digit && index > 0) { event.preventDefault(); setDigits(current => current.map((value, position) => position === index - 1 ? '' : value)); inputs.current[index - 1]?.focus(); } else if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); inputs.current[index - 1]?.focus(); } else if (event.key === 'ArrowRight' && index < 5) { event.preventDefault(); inputs.current[index + 1]?.focus(); } }} /></LocalizedAttrs>)}</Text></div></fieldset>
        <div className="customer-code-timing"><span aria-live="off"><Text>{expires ? <><Text>{"Code expires in "}</Text><strong><Text>{Math.floor(expires / 60)}</Text>:<Text>{String(expires % 60).padStart(2, '0')}</Text></strong></> : 'Code expired'}</Text></span><span><Text>{challenge.channel === 'sms' ? 'SMS' : 'WhatsApp'}</Text></span></div>
      </>}</Text>
      <Text error>{(error || (challenge && !expires)) && <p className="customer-auth-error" role="alert"><Text error>{error || 'Your verification code has expired. Please request a new code.'}</Text></p>}</Text>
      <button className="customer-auth-primary" type="submit" disabled={Boolean(busy) || (challenge ? code.length !== 6 || !expires : !validName(fullName) || !validMobile(mobile) || retryUntil > now)}><Text>{['send', 'verify'].includes(busy) && <span className="customer-auth-spinner" aria-hidden="true" />}</Text><Text>{busy === 'send' ? 'Sending code…' : busy === 'verify' ? 'Verifying…' : challenge ? 'Verify & Continue' : 'Send OTP'}</Text></button>
    </form>
    <Text>{challenge ? <div className="customer-otp-actions"><p><Text>{"Didn’t receive your code? "}</Text><button type="button" onClick={resendCode} disabled={Boolean(busy) || resend > 0}><Text>{busy === 'resend' ? 'Sending…' : resend ? `Resend OTP in ${resend}s` : 'Resend OTP'}</Text></button></p><button className="customer-change-mobile" type="button" disabled={Boolean(busy)} onClick={() => { setChallenge(null); setDigits(Array(6).fill('')); setError(''); setRetryUntil(0); }}><Text>{"Change Mobile Number"}</Text></button></div> : <><div className="customer-auth-divider"><span><Text>{"OR"}</Text></span></div><button className="customer-google-button" type="button" disabled={Boolean(busy)} onClick={continueWithGoogle}><LocalizedAttrs><Image src="/images/google-g.svg" width={20} height={20} alt="" aria-hidden="true" /></LocalizedAttrs><span><Text>{busy === 'google' ? 'Connecting to Google…' : 'Continue with Google'}</Text></span></button><p className="customer-auth-terms"><Text>{"By continuing, you agree to our"}</Text><br /><Link href="/policies"><Text>{"Terms & Conditions"}</Text></Link><Text>{" and "}</Text><Link href="/policies"><Text>{"Privacy Policy"}</Text></Link>.</p></>}</Text>
    <Text>{challenge?.developmentCode && <aside className="customer-development-preview"><strong><Text>{"Local development preview"}</Text></strong><p><Text>{"No message was sent. Test code: "}</Text><b><Text>{challenge.developmentCode}</Text></b></p></aside>}</Text>
  </section></div><p className="customer-auth-footer"><LocalizedAttrs><span lang="hi"><Text>{"हर स्वाद में अपनापन"}</Text></span></LocalizedAttrs><span>© <Text>{new Date().getFullYear()}</Text><Text>{" SON MASALA"}</Text></span></p></>;
}
