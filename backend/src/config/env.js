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
  MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//).optional(),
  MONGODB_DB_NAME: z.string().trim().min(1).optional(),
  REDIS_URL: z.string().url().optional(),
  MONGODB_DNS_SERVERS: z.string().optional(),
  EMAIL_PROVIDER: z.enum(['brevo']).default('brevo'),
  ENABLE_DEMO_CHECKOUT: z.enum(['true', 'false']).default('false'),
  DELIVERY_CHARGE_PAISE: z.coerce.number().int().min(0).default(4900),
  FREE_DELIVERY_THRESHOLD_PAISE: z.coerce.number().int().min(0).default(49900),
});

export function getEnv() {
  const env = schema.parse(process.env);
  if (env.MONGODB_DNS_SERVERS) {
    const servers = env.MONGODB_DNS_SERVERS.split(',').map(value => value.trim());
    if (!servers.length || servers.some(server => !isIP(server))) throw new Error('MONGODB_DNS_SERVERS must contain comma-separated resolver IP addresses.');
    dns.setServers(servers);
  }
  if (env.NODE_ENV === 'production') {
    if (env.ENABLE_DEMO_CHECKOUT !== 'false') throw new Error('Demo checkout must be disabled in production.');
    const origin = new URL(process.env.STAFF_APP_ORIGIN || 'https://son-dusky.vercel.app');
    const rpId = process.env.ADMIN_WEBAUTHN_RP_ID || origin.hostname;
    if (origin.protocol !== 'https:' || !(origin.hostname === rpId || origin.hostname.endsWith(`.${rpId}`)) || Buffer.from(process.env.ADMIN_MFA_ENCRYPTION_KEY || '', 'base64').length !== 32) throw new Error('Production staff security requires an HTTPS origin, a matching RP ID, and a 32-byte encryption key.');
    if (!env.MONGODB_URI || !env.MONGODB_DB_NAME) throw new Error('Production requires MONGODB_URI and MONGODB_DB_NAME.');
  }
  const configured = (env.CORS_ORIGINS || env.CORS_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean);
  const development = env.NODE_ENV === 'production' ? [] : ['http://localhost:3000'];
  env.allowedOrigins = [...new Set([...configured, ...development])];
  for (const origin of env.allowedOrigins) {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) throw new Error('Invalid CORS origin');
  }
  if (!env.allowedOrigins.length) throw new Error('Configure CORS_ORIGINS');
  return env;
}
