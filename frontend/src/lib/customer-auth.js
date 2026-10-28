export const normalizeName = value => value.trim().normalize('NFC').replace(/\s+/gu, ' ');
export const validName = value => { const name = normalizeName(value); return name.length >= 2 && name.length <= 100 && !/[\u0000-\u001f\u007f]/u.test(name); };
export const validMobile = value => /^[6-9]\d{9}$/.test(value);
const googleLoginErrors = {
  cancelled: 'Google sign-in was cancelled. You can try again or use mobile OTP.',
  state: 'Your Google sign-in request expired or could not be verified. Please try again.',
  account_link_required: 'Use mobile OTP for your existing account. Google sign-in cannot link it automatically.',
  account_unavailable: 'This account is unavailable. Please contact support.',
  failed: 'We couldn’t complete Google sign-in. Please try again or use mobile OTP.',
};
export const googleLoginError = reason => Object.hasOwn(googleLoginErrors, reason) ? googleLoginErrors[reason] : '';
export function mobileDigits(value) { const digits = value.replace(/\D/g, ''); return (digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits).slice(0, 10); }
export function customerReturnPath(value, fallback = '/account') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/u.test(value)) return fallback;
  try {
    const url = new URL(value, 'https://sonmasala.example');
    if (url.origin !== 'https://sonmasala.example' || !/^\/(?:$|account(?:\/|$)|checkout(?:\/|$)|cart(?:\/|$)|shop(?:\/|$)|product\/|orders\/|wishlist(?:\/|$))/.test(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return fallback; }
}
