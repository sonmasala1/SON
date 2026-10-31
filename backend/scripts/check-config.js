import { getEnv } from '../src/config/env.js';

let env;
try {
  env = getEnv();
} catch {
  console.log('INVALID');
  process.exitCode = 1;
}

if (!env) process.exit();

const requirements = [
  ['PORT', env.PORT],
  ['MONGODB_URI', env.MONGODB_URI],
  ['MONGODB_DB_NAME', env.MONGODB_DB_NAME],
  ['CORS_ORIGINS', env.allowedOrigins.length],
  ['GOOGLE_CLIENT_ID', process.env.GOOGLE_CLIENT_ID],
  ['GOOGLE_CLIENT_SECRET', process.env.GOOGLE_CLIENT_SECRET],
  ['BREVO_API_KEY', process.env.BREVO_API_KEY],
  ['BREVO_SENDER_EMAIL', process.env.BREVO_SENDER_EMAIL],
  ['ADMIN_SECURITY_CODE_HASH', process.env.ADMIN_SECURITY_CODE_HASH],
];

const missing = requirements.filter(([, value]) => !value).map(([name]) => name);
if (missing.length) {
  console.log('MISSING');
  process.exitCode = 1;
} else if (env.ADMIN_SECURITY_CODE_HASH && !env.ADMIN_SECURITY_CODE_HASH.startsWith('$argon2')) {
  console.log('INVALID');
  process.exitCode = 1;
} else {
  console.log('CONFIGURED');
}
