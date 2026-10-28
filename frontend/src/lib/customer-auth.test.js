import { describe, expect, it } from 'vitest';
import { customerReturnPath, mobileDigits, normalizeName, validMobile, validName, googleLoginError } from './customer-auth';

describe('passwordless customer input and return routes', () => {
  it('maps Google callback failures to fixed messages without reflecting arbitrary query text', () => {
    expect(googleLoginError('cancelled')).toContain('cancelled');
    expect(googleLoginError('account_link_required')).toContain('mobile OTP');
    expect(googleLoginError('state')).toContain('expired');
    expect(googleLoginError('account_unavailable')).toContain('unavailable');
    expect(googleLoginError('<script>untrusted</script>')).not.toContain('untrusted');
    expect(googleLoginError(null)).toBe('');
    expect(googleLoginError('__proto__')).toBe('');
    expect(googleLoginError('toString')).toBe('');
  });
  it('supports Unicode, international punctuation and whitespace normalization in names', () => {
    for (const name of ['आशा देवी', 'O’Connor', 'José María', '李 明', 'Jean-Luc Picard']) expect(validName(name)).toBe(true);
    expect(normalizeName('  आशा   देवी  ')).toBe('आशा देवी');
    for (const name of ['', ' ', 'A', 'Test\u0000Name']) expect(validName(name)).toBe(false);
  });
  it('normalizes Indian phone paste and rejects invalid mobile numbers', () => {
    expect(mobileDigits('+91 98765 43210')).toBe('9876543210');
    expect(mobileDigits('987a654b3210')).toBe('9876543210');
    expect(validMobile('9876543210')).toBe(true);
    for (const phone of ['1234567890', '987654321', '+919876543210', '98765abc10']) expect(validMobile(phone)).toBe(false);
  });
  it('preserves allowed shopping destinations and their query/hash', () => {
    for (const path of ['/checkout', '/cart', '/shop?q=haldi#products', '/product/haldi-powder', '/', '/account', '/orders/DEMO-TEST']) expect(customerReturnPath(path)).toBe(path);
  });
  it('rejects external redirects, control characters, staff destinations and login loops', () => {
    for (const path of ['https://example.com', '//example.com', '/\\example.com', '/checkout\n', '/login', '/owner/dashboard', '/admin/dashboard', '/api/v1/auth/me', '/shop/../../owner', '/%2f%2fevil.example', undefined]) expect(customerReturnPath(path)).toBe('/account');
  });
});
