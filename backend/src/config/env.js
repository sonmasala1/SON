import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.string().url().optional(),
  CORS_ORIGINS: z.string().optional(),
  MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//).optional(),
  MONGODB_DB_NAME: z.string().trim().min(1).optional(),
  REDIS_URL: z.string().url().optional(),
  ENABLE_DEMO_CHECKOUT: z.enum(['true', 'false']).default('false'),
  DELIVERY_CHARGE_PAISE: z.coerce.number().int().min(0).default(4900),
  FREE_DELIVERY_THRESHOLD_PAISE: z.coerce.number().int().min(0).default(49900),
});

export function getEnv() {
  const env = schema.parse(process.env);
  if (env.NODE_ENV === 'production') {
    const origin = new URL(process.env.STAFF_APP_ORIGIN || 'http://invalid');
    const rpId = process.env.ADMIN_WEBAUTHN_RP_ID;
    if (origin.protocol !== 'https:' || !rpId || !(origin.hostname === rpId || origin.hostname.endsWith(`.${rpId}`)) || Buffer.from(process.env.ADMIN_MFA_ENCRYPTION_KEY || '', 'base64').length !== 32) throw new Error('Production staff security requires HTTPS origin, RP ID, and a 32-byte encryption key.');
  }
  const configured = (env.CORS_ORIGINS || env.CORS_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean);
  const development = env.NODE_ENV === 'production' ? [] : ['http://localhost:3000', 'http://localhost:3001'];
  env.allowedOrigins = [...new Set([...configured, ...development])];
  for (const origin of env.allowedOrigins) {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) throw new Error('Invalid CORS origin');
  }
  if (!env.allowedOrigins.length) throw new Error('Configure CORS_ORIGINS');
  return env;
}
