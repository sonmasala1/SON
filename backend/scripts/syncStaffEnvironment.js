import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getEnv } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { initializeModels } from '../src/config/models.js';
import { environmentStaff, syncEnvironmentStaff } from '../src/services/environmentStaff.js';
import { newMfaSecret, totp, securityKey } from '../src/services/staffCrypto.js';

const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
try {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--prepare')) throw new Error('Usage: npm run staff:sync-env -- [--prepare]');
  const envPath = new URL('../.env', import.meta.url);
  let source = fs.readFileSync(envPath, 'utf8');
  let settings = dotenv.parse(source);
  if ((settings.NODE_ENV || 'development') === 'production') throw new Error('Use protected owner bootstrap and staff invitations in production.');
  const set = (key, value) => {
    const pattern = new RegExp(`^${key}\\s*=.*$`, 'gm');
    source = pattern.test(source) ? source.replace(pattern, `${key}=${value}`) : `${source.trimEnd()}\n${key}=${value}\n`;
    settings[key] = value;
  };
  if (args.includes('--prepare')) {
    if (!settings.STAFF_MFA_ENCRYPTION_KEY && !settings.ADMIN_MFA_ENCRYPTION_KEY && fs.existsSync(envPath)) {
      throw new Error('Refusing to generate a staff encryption key automatically. Configure the existing persistent key before syncing staff records.');
    }
    for (const role of ['OWNER', 'ADMIN']) {
      const key = `${role}_MFA_SECRET`;
      if (!/^[A-Z2-7]{16,128}$/.test(settings[key] || '')) set(key, newMfaSecret());
    }
  }
  const entries = environmentStaff(settings);
  const mfaEncryptionKey = settings.STAFF_MFA_ENCRYPTION_KEY || settings.ADMIN_MFA_ENCRYPTION_KEY;
  securityKey({ mfaEncryptionKey });
  if (source !== fs.readFileSync(envPath, 'utf8')) fs.writeFileSync(envPath, source);
  Object.assign(process.env, settings);
  const env = getEnv();
  await connectDatabase(env.MONGODB_URI, env.MONGODB_DB_NAME);
  await initializeModels();
  const req = { ip: 'protected-local-cli', get: () => 'staff-env-setup', app: { locals: { config: { nodeEnv: env.NODE_ENV, mfaEncryptionKey } } } };
  console.log(JSON.stringify(await syncEnvironmentStaff(req, entries)));
  const setupPath = new URL('../.runtime/staff-mfa-setup.html', import.meta.url);
  fs.mkdirSync(new URL('../.runtime/', import.meta.url), { recursive: true });
  const sections = entries.map(entry => `<section><h2>${entry.role === 'OWNER' ? 'Owner' : 'Admin'}</h2><p>Account ID: <strong>${escape(entry.loginId)}</strong></p><p>In Google Authenticator, choose <strong>Add a code → Enter a setup key</strong>. Use this key and select <strong>Time based</strong>:</p><code>${escape(entry.secret)}</code><p>Account name: SON MASALA ${escape(entry.role)}</p><p><a href="${escape(totp(entry.secret, `${entry.role}: ${entry.loginId}`).toString())}">Open authenticator setup</a></p><p>Sign in at <a href="http://localhost:3000/${entry.role.toLowerCase()}/login">/${entry.role.toLowerCase()}/login</a> with your ID, your password from backend/.env, and the current <strong>6-digit authenticator code</strong>.</p></section>`).join('');
  fs.writeFileSync(setupPath, `<!doctype html><meta charset="utf-8"><title>SON MASALA - private authenticator setup</title><style>body{max-width:850px;margin:40px auto;padding:20px;font:18px/1.7 system-ui;background:#fffaf0;color:#173d30}section{border:1px solid #d6d1bc;padding:24px;margin:24px 0}code{font-size:22px;overflow-wrap:anywhere}</style><h1>Private authenticator setup</h1><p>This local file contains your authenticator setup keys. Keep it private. The setup key goes into your authenticator; the sign-in form requires the changing 6-digit code.</p>${sections}`);
  console.log(`Private authenticator instructions saved to ${fileURLToPath(setupPath)}. No credentials were printed.`);
} catch (error) { console.error(error.name === 'MongoServerError' ? 'Staff setup failed. Check database account constraints.' : error.message); process.exitCode = 1; }
finally { await disconnectDatabase(); }
