import mongoose from 'mongoose';
import { randomBytes, createHash } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import GoogleLoginAttempt from '../models/GoogleLoginAttempt.js';
import User from '../models/User.js';
import { encryptSecret, decryptSecret, equals } from './staffCrypto.js';
import { customerNow, tokenHash, createCustomerSession } from './customerSessionService.js';
import { mergeGuestCart } from './cartService.js';
import { httpError } from '../utils/httpError.js';

export const GOOGLE_FLOW_COOKIE = 'son_google_flow';
export const GOOGLE_FLOW_MS = 10 * 60000;
const randomToken = () => randomBytes(32).toString('base64url');
export function googleFlowCookie(req, clear = false) { return { httpOnly: true, secure: req.app.locals.config.nodeEnv === 'production', sameSite: 'lax', path: '/api/v1/auth/google', ...clear ? {} : { maxAge: GOOGLE_FLOW_MS } }; }
export function customerReturnTo(value) {
  // eslint-disable-next-line no-control-regex -- Control characters are intentionally rejected in redirect destinations.
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/u.test(value)) return '/account';
  const url = new URL(value, 'https://sonmasala.example');
  if (url.origin !== 'https://sonmasala.example' || !/^\/(?:$|account(?:\/|$)|checkout(?:\/|$)|cart(?:\/|$)|shop(?:\/|$)|product\/|orders\/|wishlist(?:\/|$))/.test(url.pathname)) return '/account';
  return `${url.pathname}${url.search}${url.hash}`;
}
export function googleConfiguration(req) {
  const config = req.app.locals.config;
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(config.googleClientId || '') || !config.googleClientSecret) throw httpError(503, 'Google sign-in is currently unavailable. Please use mobile OTP.');
  let redirect;
  try { redirect = new URL(config.googleRedirectUri); } catch { throw httpError(503, 'Google sign-in is currently unavailable. Please use mobile OTP.'); }
  if (redirect.pathname !== '/api/v1/auth/google/callback' || redirect.search || redirect.hash || redirect.username || redirect.password || (redirect.protocol !== 'https:' && !(config.nodeEnv !== 'production' && redirect.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(redirect.hostname)))) throw httpError(503, 'Google sign-in is currently unavailable. Please use mobile OTP.');
  return { clientId: config.googleClientId, clientSecret: config.googleClientSecret, redirectUri: redirect.toString() };
}
export function googleClient(req, settings) {
  const client = new OAuth2Client({ clientId: settings.clientId, clientSecret: settings.clientSecret, redirectUri: settings.redirectUri, transporterOptions: { timeout: 10000, retry: false } });
  // Local certificates are injectable only in isolated tests. Signature/audience/issuer/expiry checks still run in Google's library.
  if (req.app.locals.config.nodeEnv === 'test' && req.app.locals.config.googleTestCertificates) client.getFederatedSignonCertsAsync = async () => ({ certs: req.app.locals.config.googleTestCertificates });
  return client;
}
export async function beginGoogleLogin(req, returnTo) {
  const settings = googleConfiguration(req), id = new mongoose.Types.ObjectId();
  const state = randomToken(), nonce = randomToken(), browserToken = randomToken(), verifier = randomToken();
  await GoogleLoginAttempt.create({ _id: id, stateHash: tokenHash(state), browserHash: tokenHash(browserToken), nonceHash: tokenHash(nonce), verifierEncrypted: encryptSecret(verifier, req.app.locals.config, String(id)), returnTo: customerReturnTo(returnTo), expiresAt: new Date(customerNow(req) + GOOGLE_FLOW_MS) });
  const authorizationUrl = googleClient(req, settings).generateAuthUrl({ scope: ['openid', 'email', 'profile'], access_type: 'online', prompt: 'select_account', state, nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') });
  return { authorizationUrl, browserToken };
}
export async function consumeGoogleFlow(req, state) {
  const browserToken = req.cookies[GOOGLE_FLOW_COOKIE];
  if (typeof state !== 'string' || typeof browserToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(browserToken)) throw Object.assign(httpError(401, 'Google sign-in could not be verified.'), { googleReason: 'state' });
  const flow = await GoogleLoginAttempt.findOneAndUpdate({ stateHash: tokenHash(state), browserHash: tokenHash(browserToken), usedAt: null, expiresAt: { $gt: new Date(customerNow(req)) } }, { usedAt: new Date(customerNow(req)) }, { new: true }).select('+nonceHash +verifierEncrypted');
  if (!flow) throw Object.assign(httpError(401, 'Google sign-in has expired or was already used.'), { googleReason: 'state' });
  return flow;
}
export async function verifyGoogleCode(req, code, flow) {
  const settings = googleConfiguration(req), client = googleClient(req, settings);
  const codeVerifier = decryptSecret(flow.verifierEncrypted, req.app.locals.config, flow.id);
  const exchange = req.app.locals.config.nodeEnv === 'test' && req.app.locals.config.googleTestCodeExchange;
  const result = exchange ? await exchange({ code, codeVerifier, redirectUri: settings.redirectUri }) : await client.getToken({ code, codeVerifier });
  if (!result?.tokens?.id_token) throw httpError(401, 'Google sign-in could not be verified.');
  const ticket = await client.verifyIdToken({ idToken: result.tokens.id_token, audience: settings.clientId });
  const payload = ticket.getPayload();
  const email = z.string().email().max(254).safeParse(payload?.email);
  if (!payload || typeof payload.sub !== 'string' || !payload.sub.length || payload.sub.length > 255 || payload.email_verified !== true || !email.success || typeof payload.nonce !== 'string' || !equals(tokenHash(payload.nonce), flow.nonceHash)) throw httpError(401, 'Google sign-in could not be verified.');
  // eslint-disable-next-line no-control-regex -- Provider display names must not retain non-printing ASCII controls.
  return { subject: payload.sub, email: email.data.toLowerCase(), name: (typeof payload.name === 'string' ? payload.name.normalize('NFC').trim().replace(/\s+/gu, ' ').replace(/[\u0000-\u001f\u007f]/gu, '').slice(0, 100) : '') || 'SON MASALA Customer' };
}
export async function signInGoogleCustomer(req, identity) {
  let result;
  for (let attempt = 0; ; attempt++) {
    try {
      await mongoose.connection.transaction(async session => {
        let user = await User.findOne({ googleSubject: identity.subject }).session(session);
        if (!user) {
          user = await User.findOne({ email: identity.email }).session(session);
          if (user) {
            user.googleSubject = identity.subject;
            if (!user.name || user.name === 'SON MASALA Customer') user.name = identity.name;
            user.emailVerified = true;
            user.emailVerifiedAt = new Date(customerNow(req));
          } else {
            [user] = await User.create([{
              name: identity.name,
              email: identity.email,
              googleSubject: identity.subject,
              emailVerified: true,
              emailVerifiedAt: new Date(customerNow(req)),
              role: 'CUSTOMER',
              accountStatus: 'ACTIVE'
            }], { session });
          }
        }
        if (['SUSPENDED', 'DELETED'].includes(user.accountStatus)) throw Object.assign(httpError(403, 'Your account is unavailable.'), { googleReason: 'account_unavailable' });
        user.lastLoginAt = new Date(customerNow(req)); await user.save({ session });
        await mergeGuestCart(req, user, session);
        result = { ...await createCustomerSession(req, user, 'GOOGLE', session), user };
      });
      return result;
    } catch (error) { if (error.code === 11000 && attempt < 2) continue; throw error; }
  }
}
