// Run only from an interactive terminal controlled by the verified deployment administrator.
import os from 'node:os';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { z } from 'zod';
import { getEnv } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { initializeModels } from '../src/config/models.js';
import { beginOwnerBootstrap, resumeOwnerBootstrap, completeOwnerBootstrap, recoverOwner, verifyDeploymentProof } from '../src/services/ownerBootstrap.js';
import { newMfaSecret, totp } from '../src/services/staffCrypto.js';
import { audit } from '../src/services/staffAudit.js';
import { parse } from '../src/validators/commerce.js';

if (!process.stdin.isTTY || !process.stdout.isTTY) { console.error('Owner bootstrap/recovery requires a protected interactive terminal. Redirected input/output is refused.'); process.exit(1); }
const output = new Writable({ write(chunk, _encoding, done) { if (!output.muted) process.stdout.write(chunk); done(); } });
const terminal = readline.createInterface({ input: process.stdin, output, terminal: true });
const ask = (label, hidden = false) => new Promise(resolve => { output.muted = false; terminal.question(label, value => { output.muted = false; if (hidden) process.stdout.write('\n'); resolve(hidden ? value : value.trim()); }); if (hidden) output.muted = true; });
let req;
try {
  const env = getEnv();
  await connectDatabase(env.MONGODB_URI, env.MONGODB_DB_NAME); await initializeModels();
  req = { ip: 'protected-cli', get: () => `protected-cli:${os.userInfo().username}`, app: { locals: { config: { mfaEncryptionKey: process.env.STAFF_MFA_ENCRYPTION_KEY || process.env.ADMIN_MFA_ENCRYPTION_KEY } } } };
  const recovery = process.argv.includes('--recover');
  const proof = { expectedOsUser: recovery ? process.env.OWNER_RECOVERY_OS_USER || process.env.OWNER_BOOTSTRAP_OS_USER : process.env.OWNER_BOOTSTRAP_OS_USER, actualOsUser: os.userInfo().username, secretHash: recovery ? process.env.OWNER_RECOVERY_SECRET_SHA256 : process.env.OWNER_BOOTSTRAP_SECRET_SHA256, suppliedSecret: await ask(recovery ? 'One-time deployment recovery secret: ' : 'One-time owner setup secret: ', true) };
  verifyDeploymentProof(proof);
  if (recovery) {
    const adminId = await ask('Owner ID: '), password = await ask('Current owner password: ', true), recoveryCode = await ask('Unused owner recovery code: ', true);
    const secret = newMfaSecret();
    process.stdout.write(`Enroll a new authenticator using this setup key in this protected terminal only:\n${secret}\n${totp(secret, adminId).toString()}\n`);
    const code = await ask('New authenticator verification code: ', true);
    const codes = await recoverOwner(req, { adminId, password, recoveryCode, newSecret: secret, code }, proof);
    process.stdout.write(`Owner MFA recovered; all old sessions were revoked. Store these new recovery codes offline:\n${codes.join('\n')}\n`);
  } else {
    let enrollment;
    if (process.argv.includes('--resume')) {
      enrollment = await resumeOwnerBootstrap(req, await ask('Pending Owner ID: '), proof, await ask('Owner password: ', true));
    } else {
      const fullName = await ask('Owner full name: '), email = await ask('Verified owner email: '), phone = await ask('Owner phone in international format: '), password = await ask('Choose owner password (12–128 characters): ', true);
      if (password !== await ask('Confirm owner password: ', true)) throw new Error('Passwords do not match.');
      const input = parse(z.object({ fullName: z.string().min(2).max(100), email: z.string().email(), phone: z.string().regex(/^\+[1-9]\d{7,14}$/), password: z.string().min(12).max(128) }), { fullName, email, phone, password });
      enrollment = await beginOwnerBootstrap(req, input, proof);
    }
    const setupKey = new URL(enrollment.enrollmentUri).searchParams.get('secret');
    process.stdout.write(`Owner ID: ${enrollment.account.adminId}\nEnroll your authenticator using this setup key:\n${setupKey}\n${enrollment.enrollmentUri}\n`);
    const codes = await completeOwnerBootstrap(req, enrollment.account.id, await ask('Authenticator verification code: ', true), proof);
    process.stdout.write(`Owner activated. Bootstrap is now permanently disabled in the database.\nStore these one-time recovery codes offline; they will not be shown again:\n${codes.join('\n')}\nSign in at /owner/login. Wait for the next authenticator code after enrollment.\nRemove OWNER_BOOTSTRAP_SECRET_SHA256 from deployment configuration now.\n`);
  }
} catch (error) {
  if (req) await audit(req, 'OWNER_CLI_OPERATION_REJECTED', { result: 'FAILURE' }).catch(() => {});
  console.error(error.status || error.name === 'Error' ? error.message : 'Owner setup failed. Check secure deployment configuration and database connectivity.');
  process.exitCode = 1;
} finally { terminal.close(); await disconnectDatabase(); }
