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

// ---- helpers ---------------------------------------------------------------
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((value || '').trim()); }

// ---- main component --------------------------------------------------------
export default function CustomerOtpLogin() {
  const { user, loading, refreshCart } = useStore();
  const router = useRouter(), search = useSearchParams();
  const destination = customerReturnPath(search.get('next') || search.get('returnTo'));

  // login mode: 'mobile' | 'email'
  const [mode, setMode] = useState('mobile');

  // --- mobile OTP state ---
  const [fullName, setFullName]   = useState('');
  const [mobile, setMobile]       = useState('');
  const [channel, setChannel]     = useState('sms');
  const [mobileChallenge, setMobileChallenge] = useState(null);

  // --- email OTP state ---
  const [emailName, setEmailName]         = useState('');
  const [email, setEmail]                 = useState('');
  const [emailChallenge, setEmailChallenge] = useState(null);

  // shared OTP digit state (one set per active challenge)
  const [digits, setDigits] = useState(Array(6).fill(''));

  const [busy, setBusy]           = useState('');
  const [error, setError]         = useState('');
  const [now, setNow]             = useState(Date.now());
  const [retryUntil, setRetryUntil] = useState(0);
  const inputs = useRef([]);
  const code = digits.join('');

  // Determine which challenge is active
  const challenge = mode === 'email' ? emailChallenge : mobileChallenge;

  const serverNow   = now + (challenge?.clockOffset || 0);
  const expires     = challenge ? Math.max(0, Math.ceil((Date.parse(challenge.expiresAt) - serverNow) / 1000)) : 0;
  const resendWait  = challenge ? Math.max(0, Math.ceil((Math.max(Date.parse(challenge.resendAt) - (challenge.clockOffset || 0), retryUntil) - now) / 1000)) : 0;

  useEffect(() => { if (!loading && user) router.replace(destination); }, [loading, user, router, destination]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (challenge) inputs.current[0]?.focus(); }, [challenge]);
  useEffect(() => { const message = googleLoginError(search.get('google_error')); if (message) setError(message); }, [search]);

  function report(err) {
    setError(err.message.replace(/^HTTP \d+: /, ''));
    if (err.retryAfter) setRetryUntil(Date.now() + err.retryAfter * 1000);
  }

  function acceptChallenge(result, isEmail = false) {
    if (result.authenticated) { refreshCart().then(() => router.replace(destination)); return; }
    const obj = { ...result, clockOffset: Date.parse(result.serverTime) - Date.now() };
    if (isEmail) { setEmailChallenge(obj); } else { setMobileChallenge(obj); }
    setDigits(Array(6).fill('')); setNow(Date.now()); setRetryUntil(0);
  }

  // ---- mobile submit -------------------------------------------------------
  async function submitMobile(event) {
    event.preventDefault(); if (busy) return; setError('');
    if (!mobileChallenge) {
      if (!validName(fullName) || !validMobile(mobile)) return;
      setBusy('send');
      try {
        acceptChallenge(await apiRequest('auth/send-otp', { method: 'POST', timeout: 20000, body: JSON.stringify({ fullName: normalizeName(fullName), phone: `+91${mobile}`, channel }) }), false);
      } catch (err) { report(err); } finally { setBusy(''); }
    } else {
      if (code.length !== 6 || !expires) return;
      setBusy('verify');
      try {
        await apiRequest('auth/verify-otp', { method: 'POST', timeout: 20000, body: JSON.stringify({ challengeToken: mobileChallenge.challengeToken, code }) });
        setDigits(Array(6).fill('')); await refreshCart(); router.replace(destination);
      } catch (err) { report(err); } finally { setBusy(''); }
    }
  }

  async function resendMobile() {
    if (busy || resendWait > 0) return; setBusy('resend'); setError('');
    try { acceptChallenge(await apiRequest('auth/resend-otp', { method: 'POST', timeout: 20000, body: JSON.stringify({ challengeToken: mobileChallenge.challengeToken }) }), false); }
    catch (err) { report(err); } finally { setBusy(''); }
  }

  // ---- email submit --------------------------------------------------------
  async function submitEmail(event) {
    event.preventDefault(); if (busy) return; setError('');
    if (!emailChallenge) {
      if (!validName(emailName) || !validEmail(email)) return;
      setBusy('send');
      try {
        acceptChallenge(await apiRequest('auth/email/send-otp', { method: 'POST', timeout: 30000, body: JSON.stringify({ fullName: normalizeName(emailName), email: email.trim().toLowerCase() }) }), true);
      } catch (err) { report(err); } finally { setBusy(''); }
    } else {
      if (code.length !== 6 || !expires) return;
      setBusy('verify');
      try {
        await apiRequest('auth/email/verify-otp', { method: 'POST', timeout: 20000, body: JSON.stringify({ challengeToken: emailChallenge.challengeToken, code }) });
        setDigits(Array(6).fill('')); await refreshCart(); router.replace(destination);
      } catch (err) { report(err); } finally { setBusy(''); }
    }
  }

  async function resendEmail() {
    if (busy || resendWait > 0) return; setBusy('resend'); setError('');
    try { acceptChallenge(await apiRequest('auth/email/resend-otp', { method: 'POST', timeout: 30000, body: JSON.stringify({ challengeToken: emailChallenge.challengeToken }) }), true); }
    catch (err) { report(err); } finally { setBusy(''); }
  }

  // ---- switch mode (reset challenge + errors) ------------------------------
  function switchMode(next) {
    if (busy) return;
    setMode(next); setError(''); setDigits(Array(6).fill('')); setRetryUntil(0);
  }

  // ---- digit input helpers -------------------------------------------------
  function enterDigits(index, value) {
    const numbers = value.replace(/\D/g, '').slice(0, 6);
    if (!numbers) { setDigits(cur => cur.map((d, i) => i === index ? '' : d)); return; }
    const start = numbers.length === 6 ? 0 : index;
    setDigits(cur => { const r = [...cur]; for (let o = 0; o < numbers.length && start + o < 6; o++) r[start + o] = numbers[o]; return r; });
    inputs.current[Math.min(5, start + numbers.length)]?.focus(); setError('');
  }

  // ---- Google login --------------------------------------------------------
  async function continueWithGoogle() {
    if (busy) return; setBusy('google'); setError('');
    try {
      const result = await apiRequest('auth/google/start', { method: 'POST', body: JSON.stringify({ returnTo: destination }) });
      if (result.authenticated) { await refreshCart(); router.replace(destination); return; }
      const authorization = new URL(result.authorizationUrl);
      if (authorization.protocol !== 'https:' || authorization.origin !== 'https://accounts.google.com') throw new Error('Google sign-in is currently unavailable. Please use mobile OTP.');
      window.location.assign(authorization.toString());
    } catch (err) { report(err); setBusy(''); }
  }

  // ---- render --------------------------------------------------------------
  if (loading || user) {
    return <div className="customer-auth-loading" role="status"><Text>{user ? 'Taking you to your account…' : 'Checking your session…'}</Text></div>;
  }

  const activeChallenge   = challenge;
  const isEmailMode       = mode === 'email';
  const submitHandler     = isEmailMode ? submitEmail : submitMobile;
  const resendHandler     = isEmailMode ? resendEmail : resendMobile;

  // OTP step heading / description
  const otpHeading = isEmailMode ? <>Verify Your<br />Email Address</> : <>Verify Your<br />Mobile Number</>;
  const otpDesc    = isEmailMode
    ? <><Text>{'Enter the 6-digit code sent to '}</Text><strong>{activeChallenge?.email}</strong></>
    : <><Text>{'Enter the 6-digit verification code '}</Text><Text>{activeChallenge?.developmentCode ? 'for' : 'sent to'}</Text><br /><strong>+91 <Text>{activeChallenge?.phone?.slice(3, 8)}</Text> <Text>{activeChallenge?.phone?.slice(8)}</Text></strong></>;

  const channelLabel = isEmailMode ? 'Email' : (challenge?.channel === 'sms' ? 'SMS' : 'WhatsApp');

  return (
    <><div className="customer-auth-stage"><section className="customer-auth-card" aria-labelledby="customer-auth-heading" aria-busy={Boolean(busy)}>
      <div className="customer-auth-brand"><Brand /></div>

      {/* Heading */}
      <div className="customer-auth-intro" key={activeChallenge ? `verify-${mode}` : `welcome-${mode}`}>
        <h1 id="customer-auth-heading" tabIndex={-1}>
          <Text>{activeChallenge ? otpHeading : <><Text>{'Welcome to'}</Text><br /><Text>{'SON MASALA'}</Text></>}</Text>
        </h1>
        <p><Text>{activeChallenge ? otpDesc : 'Sign in or join us to explore authentic Indian spices'}</Text></p>
      </div>

      {/* ===================== MOBILE OTP FORM ======================== */}
      {mode === 'mobile' && (
        <form className="customer-auth-form" onSubmit={submitMobile}>
          {!mobileChallenge ? (<>
            <div className="customer-auth-field">
              <label htmlFor="customer-full-name"><Text>{'FULL NAME'}</Text></label>
              <LocalizedAttrs><input id="customer-full-name" name="fullName" value={fullName} onChange={e => setFullName(e.target.value)} onBlur={() => setFullName(normalizeName(fullName))} autoComplete="name" placeholder="Enter your full name" minLength={2} maxLength={100} required disabled={Boolean(busy)} /></LocalizedAttrs>
            </div>
            <div className="customer-auth-field">
              <label htmlFor="customer-mobile"><Text>{'MOBILE NUMBER'}</Text></label>
              <div className="customer-mobile-field">
                <span aria-hidden="true">+91</span>
                <LocalizedAttrs><input id="customer-mobile" name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" value={mobile} onChange={e => setMobile(mobileDigits(e.target.value))} placeholder="Enter 10-digit mobile number" pattern="[6-9][0-9]{9}" maxLength={20} required aria-describedby="mobile-format" disabled={Boolean(busy)} /></LocalizedAttrs>
              </div>
              <span id="mobile-format" className="sr-only"><Text>{'Indian mobile number. Country code +91. Ten digits, starting with 6, 7, 8, or 9.'}</Text></span>
            </div>
            <fieldset className="customer-otp-channels">
              <legend><Text>{'Receive verification code via'}</Text></legend>
              <div><Text>{[['sms', 'SMS OTP'], ['whatsapp', 'WhatsApp OTP']].map(([value, label]) => (
                <label className={channel === value ? 'is-selected' : ''} key={value}>
                  <input type="radio" name="channel" value={value} checked={channel === value} onChange={() => setChannel(value)} disabled={Boolean(busy)} />
                  <span><Text>{label}</Text></span>
                </label>
              ))}</Text></div>
            </fieldset>
          </>) : (<>
            <fieldset className="customer-otp-fields">
              <legend><Text>{'VERIFICATION CODE'}</Text></legend>
              <div className="customer-otp-digits">
                <Text>{digits.map((digit, index) => (
                  <LocalizedAttrs key={index}><input
                    ref={el => { inputs.current[index] = el; }}
                    aria-label={`Verification code digit ${index + 1}`}
                    type="text" inputMode="numeric"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    pattern="[0-9]" maxLength={6} value={digit}
                    disabled={Boolean(busy)} required
                    onFocus={e => e.target.select()}
                    onChange={e => enterDigits(index, e.target.value)}
                    onPaste={e => { e.preventDefault(); enterDigits(index, e.clipboardData.getData('text')); }}
                    onKeyDown={e => {
                      if (e.key === 'Backspace' && !digit && index > 0) { e.preventDefault(); setDigits(cur => cur.map((v, p) => p === index - 1 ? '' : v)); inputs.current[index - 1]?.focus(); }
                      else if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); inputs.current[index - 1]?.focus(); }
                      else if (e.key === 'ArrowRight' && index < 5) { e.preventDefault(); inputs.current[index + 1]?.focus(); }
                    }}
                  /></LocalizedAttrs>
                ))}</Text>
              </div>
            </fieldset>
            <div className="customer-code-timing">
              <span aria-live="off"><Text>{expires ? <><Text>{'Code expires in '}</Text><strong><Text>{Math.floor(expires / 60)}</Text>:<Text>{String(expires % 60).padStart(2, '0')}</Text></strong></> : 'Code expired'}</Text></span>
              <span><Text>{channelLabel}</Text></span>
            </div>
          </>)}

          <Text error>{(error || (mobileChallenge && !expires)) && <p className="customer-auth-error" role="alert"><Text error>{error || 'Your verification code has expired. Please request a new code.'}</Text></p>}</Text>
          <button className="customer-auth-primary" type="submit" disabled={Boolean(busy) || (mobileChallenge ? code.length !== 6 || !expires : !validName(fullName) || !validMobile(mobile) || retryUntil > now)}>
            <Text>{['send', 'verify'].includes(busy) && <span className="customer-auth-spinner" aria-hidden="true" />}</Text>
            <Text>{busy === 'send' ? 'Sending code…' : busy === 'verify' ? 'Verifying…' : mobileChallenge ? 'Verify & Continue' : 'Send OTP'}</Text>
          </button>
        </form>
      )}

      {/* ===================== EMAIL OTP FORM ========================= */}
      {mode === 'email' && (
        <form className="customer-auth-form" onSubmit={submitEmail}>
          {!emailChallenge ? (<>
            <div className="customer-auth-field">
              <label htmlFor="email-full-name"><Text>{'FULL NAME'}</Text></label>
              <LocalizedAttrs><input id="email-full-name" name="fullName" value={emailName} onChange={e => setEmailName(e.target.value)} onBlur={() => setEmailName(normalizeName(emailName))} autoComplete="name" placeholder="Enter your full name" minLength={2} maxLength={100} required disabled={Boolean(busy)} /></LocalizedAttrs>
            </div>
            <div className="customer-auth-field">
              <label htmlFor="customer-email"><Text>{'EMAIL ADDRESS'}</Text></label>
              <LocalizedAttrs><input id="customer-email" name="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter your email address" maxLength={254} required disabled={Boolean(busy)} /></LocalizedAttrs>
            </div>
          </>) : (<>
            <fieldset className="customer-otp-fields">
              <legend><Text>{'VERIFICATION CODE'}</Text></legend>
              <div className="customer-otp-digits">
                <Text>{digits.map((digit, index) => (
                  <LocalizedAttrs key={index}><input
                    ref={el => { inputs.current[index] = el; }}
                    aria-label={`Email verification code digit ${index + 1}`}
                    type="text" inputMode="numeric"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    pattern="[0-9]" maxLength={6} value={digit}
                    disabled={Boolean(busy)} required
                    onFocus={e => e.target.select()}
                    onChange={e => enterDigits(index, e.target.value)}
                    onPaste={e => { e.preventDefault(); enterDigits(index, e.clipboardData.getData('text')); }}
                    onKeyDown={e => {
                      if (e.key === 'Backspace' && !digit && index > 0) { e.preventDefault(); setDigits(cur => cur.map((v, p) => p === index - 1 ? '' : v)); inputs.current[index - 1]?.focus(); }
                      else if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); inputs.current[index - 1]?.focus(); }
                      else if (e.key === 'ArrowRight' && index < 5) { e.preventDefault(); inputs.current[index + 1]?.focus(); }
                    }}
                  /></LocalizedAttrs>
                ))}</Text>
              </div>
            </fieldset>
            <div className="customer-code-timing">
              <span aria-live="off"><Text>{expires ? <><Text>{'Code expires in '}</Text><strong><Text>{Math.floor(expires / 60)}</Text>:<Text>{String(expires % 60).padStart(2, '0')}</Text></strong></> : 'Code expired'}</Text></span>
              <span><Text>{'Email'}</Text></span>
            </div>
          </>)}

          <Text error>{(error || (emailChallenge && !expires)) && <p className="customer-auth-error" role="alert"><Text error>{error || 'Your verification code has expired. Please request a new code.'}</Text></p>}</Text>
          <button className="customer-auth-primary" type="submit" disabled={Boolean(busy) || (emailChallenge ? code.length !== 6 || !expires : !validName(emailName) || !validEmail(email) || retryUntil > now)}>
            <Text>{['send', 'verify'].includes(busy) && <span className="customer-auth-spinner" aria-hidden="true" />}</Text>
            <Text>{busy === 'send' ? 'Sending code…' : busy === 'verify' ? 'Verifying…' : emailChallenge ? 'Verify & Continue' : 'Send OTP to Email'}</Text>
          </button>
        </form>
      )}

      {/* ===================== OTP ACTIONS (resend / change) ========== */}
      {activeChallenge && (
        <div className="customer-otp-actions">
          <p>
            <Text>{"Didn't receive your code? "}</Text>
            <button type="button" onClick={isEmailMode ? resendEmail : resendMobile} disabled={Boolean(busy) || resendWait > 0}>
              <Text>{busy === 'resend' ? 'Sending…' : resendWait ? `Resend OTP in ${resendWait}s` : 'Resend OTP'}</Text>
            </button>
          </p>
          <button className="customer-change-mobile" type="button" disabled={Boolean(busy)} onClick={() => { if (isEmailMode) setEmailChallenge(null); else setMobileChallenge(null); setDigits(Array(6).fill('')); setError(''); setRetryUntil(0); }}>
            <Text>{isEmailMode ? 'Change Email Address' : 'Change Mobile Number'}</Text>
          </button>
        </div>
      )}

      {/* ===================== OR DIVIDERS + ALTERNATE METHODS ======= */}
      {!activeChallenge && (<>
        {/* Switch between mobile / email */}
        <div className="customer-auth-divider"><span><Text>{'OR'}</Text></span></div>
        {mode === 'mobile' ? (
          <button className="customer-email-button" type="button" disabled={Boolean(busy)} onClick={() => switchMode('email')}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>
            <span><Text>{'Continue with Email OTP'}</Text></span>
          </button>
        ) : (
          <button className="customer-email-button" type="button" disabled={Boolean(busy)} onClick={() => switchMode('mobile')}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>
            <span><Text>{'Continue with Mobile OTP'}</Text></span>
          </button>
        )}

        {/* Google */}
        <div className="customer-auth-divider"><span><Text>{'OR'}</Text></span></div>
        <button className="customer-google-button" type="button" disabled={Boolean(busy)} onClick={continueWithGoogle}>
          <LocalizedAttrs><Image src="/images/google-g.svg" width={20} height={20} alt="" aria-hidden="true" /></LocalizedAttrs>
          <span><Text>{busy === 'google' ? 'Connecting to Google…' : 'Continue with Google'}</Text></span>
        </button>

        <p className="customer-auth-terms">
          <Text>{'By continuing, you agree to our'}</Text><br />
          <Link href="/policies"><Text>{'Terms & Conditions'}</Text></Link><Text>{' and '}</Text><Link href="/policies"><Text>{'Privacy Policy'}</Text></Link>.
        </p>
      </>)}

      {/* Dev preview banner */}
      <Text>{activeChallenge?.developmentCode && (
        <aside className="customer-development-preview">
          <strong><Text>{'Local development preview'}</Text></strong>
          <p><Text>{'No message was sent. Test code: '}</Text><b><Text>{activeChallenge.developmentCode}</Text></b></p>
        </aside>
      )}</Text>

    </section></div>
    <p className="customer-auth-footer">
      <LocalizedAttrs><span lang="hi"><Text>{'हर स्वाद में अपनापन'}</Text></span></LocalizedAttrs>
      <span>© <Text>{new Date().getFullYear()}</Text><Text>{' SON MASALA'}</Text></span>
    </p></>
  );
}
