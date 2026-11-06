import { describe, it, expect } from 'vitest';
import { translate } from './i18n';

// Regression: these visible strings rendered in English while the site was in Hindi.
const covered = [
  // Store information page
  'Ordering and payment', 'Delivery', 'Cancellations', 'Customer reviews', 'Your shopping bag and account', 'Your wishlist and delivery details',
  'Place your order using Pay Later. Your payment remains pending until our team confirms receipt. Our team will contact you to arrange payment and shipment. Online payment is currently unavailable.',
  'Signed-in customers may submit reviews. Reviews require administrator approval before appearing publicly.',
  'Contact us for help with your order, payment or shipment.',
  // Staff sign-in
  'Sign in as Admin', 'Sign in as Owner', 'Admin Security Code', 'Owner Security Code', 'Use my authenticator app instead', 'Use the security code instead',
  'Sign-in succeeded, but this browser did not keep the secure session cookie. Allow cookies for this site (or disable strict tracking prevention), then sign in again.',
];

describe('Hindi coverage for public policies and staff sign-in', () => {
  it.each(covered)('%s', english => {
    expect(translate(english, 'hi')).toMatch(/[ऀ-ॿ]/u);
    expect(translate(english, 'en')).toBe(english);
  });
});
