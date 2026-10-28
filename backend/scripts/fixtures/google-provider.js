// Test-only provider: signed JWTs still pass through Google's real signature/issuer/audience/expiry verifier.
// No production route or environment setting can enable this fixture.
import { createHash, generateKeyPairSync, sign } from 'node:crypto';

export const GOOGLE_TEST_CLIENT_ID = 'isolated-test.apps.googleusercontent.com';
export function createGoogleTestProvider() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const wrongKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const kid = 'isolated-test-key';
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return {
    googleClientId: GOOGLE_TEST_CLIENT_ID, googleClientSecret: 'isolated-test-secret',
    googleRedirectUri: 'http://localhost:5000/api/v1/auth/google/callback',
    googleTestCertificates: { [kid]: publicKey.export({ type: 'spki', format: 'pem' }) },
    googleTestCodeExchange: async ({ code, codeVerifier, redirectUri }) => {
      const input = JSON.parse(Buffer.from(code, 'base64url').toString());
      if (input.challenge !== createHash('sha256').update(codeVerifier).digest('base64url') || redirectUri !== 'http://localhost:5000/api/v1/auth/google/callback') throw new Error('Invalid isolated PKCE exchange');
      if (input.missingToken) return { tokens: {} };
      const now = Math.floor(Date.now() / 1000);
      const payload = { iss: 'https://accounts.google.com', aud: GOOGLE_TEST_CLIENT_ID, iat: now, exp: now + 3600, sub: 'isolated-customer', email: 'google-shopper@example.com', email_verified: true, name: 'Google Shopper', nonce: input.nonce, ...input.claims };
      const message = `${encode({ alg: 'RS256', typ: 'JWT', kid })}.${encode(payload)}`;
      const signature = sign('RSA-SHA256', Buffer.from(message), input.badSignature ? wrongKey : privateKey).toString('base64url');
      return { tokens: { id_token: `${message}.${signature}` } };
    },
  };
}
