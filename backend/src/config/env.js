import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';
import dns from 'node:dns';
import { isIP } from 'node:net';

// Load local configuration only from backend/.env. Render and other runtimes supply process.env.
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.string().url().optional(),
  CORS_ORIGINS: z.string().optional(),
  LOCAL_CORS_ORIGINS: z.string().optional(),
  PRODUCTION_CORS_ORIGINS: z.string().optional(),
  STAFF_APP_ORIGIN: z.string().url().optional(),
  LOCAL_STAFF_APP_ORIGIN: z.string().url().optional(),
  PRODUCTION_STAFF_APP_ORIGIN: z.string().url().optional(),
  STAFF_MFA_ENCRYPTION_KEY: z.string().optional(),
  ADMIN_MFA_ENCRYPTION_KEY: z.string().optional(),
  ADMIN_SECURITY_CODE_HASH: z.string().optional(),
  OWNER_SECURITY_CODE_HASH: z.string().optional(),
  ENABLE_DEMO_CHECKOUT: z.enum(['true', 'false']).default('false'),
  AUTH_DEV_PREVIEW: z.enum(['true', 'false']).default('false'),
  MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//).optional(),
  MONGODB_DB_NAME: z.string().trim().min(1).optional(),
  REDIS_URL: z.string().url().optional(),
  MONGODB_DNS_SERVERS: z.string().optional(),
  EMAIL_PROVIDER: z.enum(['brevo']).default('brevo'),
  DELIVERY_CHARGE_PAISE: z.coerce.number().int().min(0).default(4900),
  FREE_DELIVERY_THRESHOLD_PAISE: z.coerce.number().int().min(0).default(49900),
});

export function getEnv() {
  const env = schema.parse(process.env);
  const staffKey = process.env.STAFF_MFA_ENCRYPTION_KEY;
  const adminKey = process.env.ADMIN_MFA_ENCRYPTION_KEY;
  if (staffKey && adminKey && staffKey !== adminKey) throw new Error('STAFF_MFA_ENCRYPTION_KEY and ADMIN_MFA_ENCRYPTION_KEY must match when both are configured.');
  env.mfaEncryptionKey = staffKey || adminKey || '';
  if (env.mfaEncryptionKey) {
    const decoded = Buffer.from(env.mfaEncryptionKey, 'base64');
    const canonical = decoded.toString('base64').replace(/=+$/, '');
    const configured = env.mfaEncryptionKey.replace(/=+$/, '');
    if (decoded.length !== 32 || canonical !== configured) {
      throw new Error('Staff MFA encryption key must be valid Base64 encoding of exactly 32 bytes.');
    }
  }
  const production = env.NODE_ENV === 'production';
  const legacyStaffOrigin = process.env.STAFF_APP_ORIGIN;
  const compatibleStaffOrigin = (() => {
    if (!legacyStaffOrigin) return '';
    try {
      const parsed = new URL(legacyStaffOrigin);
      return production
        ? (parsed.protocol === 'https:' && parsed.hostname === 'son-dusky.vercel.app' ? legacyStaffOrigin : '')
        : (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname) ? legacyStaffOrigin : '');
    } catch {
      return '';
    }
  })();
  env.staffAppOrigin = production
    ? process.env.PRODUCTION_STAFF_APP_ORIGIN || compatibleStaffOrigin || 'https://son-dusky.vercel.app'
    : process.env.LOCAL_STAFF_APP_ORIGIN || compatibleStaffOrigin || 'http://localhost:3000';
  if (env.MONGODB_DNS_SERVERS) {
    const servers = env.MONGODB_DNS_SERVERS.split(',').map(value => value.trim());
    if (!servers.length || servers.some(server => !isIP(server))) throw new Error('MONGODB_DNS_SERVERS must contain comma-separated resolver IP addresses.');
    dns.setServers(servers);
  }
  if (production) {
    const origin = new URL(env.staffAppOrigin);
    const rpId = process.env.ADMIN_WEBAUTHN_RP_ID || origin.hostname;
    if (origin.protocol !== 'https:' || !(origin.hostname === rpId || origin.hostname.endsWith(`.${rpId}`)) || Buffer.from(env.mfaEncryptionKey, 'base64').length !== 32) throw new Error('Production staff security requires an HTTPS origin, a matching RP ID, and a 32-byte encryption key.');
    if (!env.MONGODB_URI || !env.MONGODB_DB_NAME) throw new Error('Production requires MONGODB_URI and MONGODB_DB_NAME.');
  }
  const scopedCors = production ? process.env.PRODUCTION_CORS_ORIGINS : process.env.LOCAL_CORS_ORIGINS;
  const configured = (scopedCors || env.CORS_ORIGINS || env.CORS_ORIGIN || '')
    .split(',')
    .map(value => value.trim())
    .filter((origin) => {
      if (!origin) return false;
      try {
        const parsed = new URL(origin);
        return production
          ? parsed.protocol === 'https:' && parsed.hostname === 'son-dusky.vercel.app'
          : parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
      } catch {
        return false;
      }
    });
  const fallbackOrigin = production ? 'https://son-dusky.vercel.app' : 'http://localhost:3000';
  env.allowedOrigins = [...new Set(configured.length ? configured : [fallbackOrigin])];
  for (const origin of env.allowedOrigins) {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) throw new Error('Invalid CORS origin');
  }
  if (!env.allowedOrigins.length) throw new Error('Configure CORS_ORIGINS');
  return env;
}
