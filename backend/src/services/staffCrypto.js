import { randomBytes, createHash, createHmac, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
import { hash, verify, Algorithm } from '@node-rs/argon2';
import * as OTPAuth from 'otpauth';
import { httpError } from '../utils/httpError.js';

export const randomToken = () => randomBytes(32).toString('base64url');
export const digest = value => createHash('sha256').update(value).digest('hex');
export function equals(a, b) { const first = Buffer.from(a || ''), second = Buffer.from(b || ''); return first.length === second.length && first.length > 0 && timingSafeEqual(first, second); }
export function securityKey(config) {
  const key = Buffer.from(config.mfaEncryptionKey || '', 'base64');
  if (key.length !== 32) {
    const error = httpError(503, 'Staff security is not configured. Contact the deployment administrator.');
    error.code = 'STAFF_SECURITY_NOT_CONFIGURED';
    error.logReason = 'staff_security_not_configured';
    throw error;
  }
  return key;
}
export function customerSecurityKey(config) {
  const dedicated = Buffer.from(config.customerAuthKey || '', 'base64');
  if (config.customerAuthKey && dedicated.length !== 32) {
    throw httpError(503, 'Customer authentication security is not configured. Contact the deployment administrator.');
  }
  if (config.customerAuthKey && dedicated.length === 32) return dedicated;
  const legacy = Buffer.from(config.mfaEncryptionKey || '', 'base64');
  if (legacy.length === 32) return legacy;
  const hashFallback = config.adminSecurityCodeHash || config.ownerSecurityCodeHash;
  if (typeof hashFallback === 'string' && hashFallback.length) return createHash('sha256').update(hashFallback).digest();
  throw httpError(503, 'Customer authentication security is not configured. Contact the deployment administrator.');
}
export const customerDigest = (value, config) => {
  const dedicated = Buffer.from(config.customerAuthKey || '', 'base64');
  if (config.customerAuthKey && dedicated.length === 32) return createHmac('sha256', dedicated).update(value).digest('hex');
  const legacy = Buffer.from(config.mfaEncryptionKey || '', 'base64');
  if (legacy.length === 32) return createHmac('sha256', legacy).update(value).digest('hex');
  const hashFallback = config.adminSecurityCodeHash || config.ownerSecurityCodeHash;
  if (typeof hashFallback === 'string' && hashFallback.length) return createHmac('sha256', Buffer.from(hashFallback)).update(value).digest('hex');
  throw httpError(503, 'Customer authentication security is not configured. Contact the deployment administrator.');
};
export const keyedDigest = (value, config) => {
  try {
    return createHmac('sha256', securityKey(config)).update(value).digest('hex');
  } catch {
    const fallback = config.adminSecurityCodeHash || config.ownerSecurityCodeHash;
    if (!fallback || typeof fallback !== 'string') throw httpError(503, 'Staff security is not configured. Contact the deployment administrator.');
    return createHmac('sha256', Buffer.from(fallback)).update(value).digest('hex');
  }
};
export function encryptCustomerSecret(value, config, context) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', customerSecurityKey(config), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}
export function decryptCustomerSecret(value, config, context) {
  try {
    const [version, iv, tag, data] = value.split('.');
    if (version !== 'v1') throw new Error('Unsupported encryption version');
    const cipher = createDecipheriv('aes-256-gcm', customerSecurityKey(config), Buffer.from(iv, 'base64url'));
    cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([cipher.update(Buffer.from(data, 'base64url')), cipher.final()]).toString('utf8');
  } catch (error) {
    if (error.status === 503) throw error;
    const mismatch = httpError(503, 'Customer authentication data could not be verified. Please try again.');
    mismatch.code = 'CUSTOMER_SECURITY_KEY_MISMATCH';
    mismatch.logReason = 'customer_security_key_mismatch';
    throw mismatch;
  }
}
export async function hashPassword(password) { return hash(password, { algorithm: Algorithm.Argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 }); }
const dummyPassword = hashPassword(randomToken());
export async function verifyPassword(encoded, password) { try { return await verify(encoded || await dummyPassword, password); } catch { return false; } }
export function encryptSecret(value, config, context) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', securityKey(config), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}
export function decryptSecret(value, config, context) {
  try {
    const [version, iv, tag, data] = value.split('.');
    if (version !== 'v1') throw new Error('Unsupported encryption version');
    const cipher = createDecipheriv('aes-256-gcm', securityKey(config), Buffer.from(iv, 'base64url'));
    cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([cipher.update(Buffer.from(data, 'base64url')), cipher.final()]).toString('utf8');
  } catch (error) {
    if (error.status === 503) throw error;
    const mismatch = httpError(503, 'Staff security could not verify the existing MFA enrolment. Contact the deployment administrator.');
    mismatch.code = 'STAFF_SECURITY_KEY_MISMATCH';
    mismatch.logReason = 'staff_security_key_mismatch';
    throw mismatch;
  }
}
export const newMfaSecret = () => new OTPAuth.Secret({ size: 20 }).base32;
export const totp = (secret, label = 'SON MASALA') => new OTPAuth.TOTP({ issuer: 'SON MASALA', label, algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) });
export function mfaStep(secret, code, now = Date.now()) { const delta = totp(secret).validate({ token: code, timestamp: now, window: 1 }); return delta === null ? null : Math.floor(now / 30000) + delta; }
export function recoveryCodes() { return Array.from({ length: 10 }, () => randomBytes(16).toString('hex').toUpperCase().match(/.{1,4}/g).join('-')); }
export const newAdminId = owner => `${owner ? 'OWN' : 'ADM'}-${randomBytes(8).toString('hex').toUpperCase()}`;
