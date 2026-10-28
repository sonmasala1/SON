import { describe, it, expect } from 'vitest';
import { hindiMessages, englishOverrides } from './messages';
import { staffHindiMessages } from './staff-messages';
import { translate, validationMessage, productName, productDescription } from './i18n';
describe('Hindi / English message catalogue', () => {
  it('provides real Hindi translations for the full public and staff catalogues', () => {
    const entries = Object.entries({ ...hindiMessages, ...staffHindiMessages }); expect(entries.length).toBeGreaterThan(550);
    for (const [english, hindi] of entries) { expect(hindi, english).toMatch(/[\u0900-\u097f]/u); expect(translate(english, 'hi'), english).toBe(hindi); expect(translate(english, 'en'), english).toBe(english); }
  });
  it('translates original Hindi copy back to English and preserves whitespace', () => {
    for (const [hindi, english] of Object.entries(englishOverrides)) expect(translate(hindi, 'en')).toBe(english);
    expect(translate(' Add to Cart ', 'hi')).toBe(' कार्ट में जोड़ें ');
  });
  it('localizes dynamic quantity, OTP, price and accessibility messages without changing IDs', () => {
    expect(translate('Shopping cart, 2 items', 'hi')).toBe('शॉपिंग कार्ट, 2 उत्पाद');
    expect(translate('Save Haldi Powder to wishlist', 'hi')).toContain('हल्दी पाउडर');
    expect(translate('Resend OTP in 59s', 'hi')).toContain('59 सेकंड');
    expect(translate('HTTP 401: Please sign in to continue.', 'hi')).toBe('आगे बढ़ने के लिए लॉग इन करें।');
    expect(translate('100 g', 'hi')).toBe('100 ग्राम'); expect(translate('DEMO-1234', 'hi')).toBe('DEMO-1234');
  });
  it('uses Hindi validation fallbacks and localized product fields', () => {
    expect(validationMessage({ valueMissing: true }, 'hi')).toBe('कृपया यह जानकारी भरें।');
    expect(translate('Unknown provider failure', 'hi', { error: true })).not.toMatch(/[a-z]/i);
    const product = { name: 'Custom Product', hindiName: 'खास मसाला', description: 'English description', hindiDescription: 'हिंदी विवरण' };
    expect(productName(product, 'hi')).toBe('खास मसाला'); expect(productDescription(product, 'hi')).toBe('हिंदी विवरण');
    expect(productName({ name: 'Untranslated Product' }, 'hi')).toBe('मसाला');
  });
});
