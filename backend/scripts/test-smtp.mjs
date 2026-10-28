/**
 * SON MASALA — SMTP Connection Test
 * Run: node backend/scripts/test-smtp.mjs
 * Never logs the SMTP password.
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM) {
  console.error('❌  Missing SMTP environment variables. Check backend/.env');
  console.error('    Required: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM');
  process.exit(1);
}

const port = Number(SMTP_PORT || 587);
console.log(`\n📧  SON MASALA SMTP Test`);
console.log(`    Host  : ${SMTP_HOST}:${port}`);
console.log(`    User  : ${SMTP_USER}`);
console.log(`    From  : ${SMTP_FROM}`);
console.log(`    Secure: ${port === 465} (requireTLS: true)\n`);

const transport = nodemailer.createTransport({
  host: SMTP_HOST,
  port,
  secure: port === 465,
  requireTLS: true,
  auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  connectionTimeout: 15000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

try {
  console.log('⏳  Verifying SMTP credentials…');
  await transport.verify();
  console.log('✅  SMTP authentication successful.\n');

  console.log('⏳  Sending test email to', SMTP_USER, '…');
  const info = await transport.sendMail({
    from: SMTP_FROM,
    to: SMTP_USER,
    subject: 'SON MASALA — SMTP Test ✅',
    text: 'This is a test email from the SON MASALA backend SMTP test script.\n\nIf you received this, Gmail SMTP is configured correctly.',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;background:#fff8f0;border-radius:12px;border:1px solid #f0e0d0">
        <h2 style="color:#c0392b;margin:0 0 12px">SON MASALA</h2>
        <p style="color:#333;font-size:15px">✅ SMTP is working correctly.</p>
        <p style="color:#555;font-size:14px">This test email was sent from the SON MASALA backend SMTP test script.</p>
      </div>
    `,
  });

  console.log('✅  Test email sent successfully!');
  console.log(`    Message ID : ${info.messageId}`);
  console.log(`    Response   : ${info.response}\n`);
} catch (error) {
  console.error('❌  SMTP test failed:');
  // Never log the password — only show sanitized error info
  const safe = error.message?.replace(new RegExp(SMTP_PASSWORD, 'g'), '***') || 'Unknown error';
  console.error(`    ${safe}`);
  if (error.code) console.error(`    Code: ${error.code}`);
  if (error.responseCode) console.error(`    SMTP Response Code: ${error.responseCode}`);
  console.error('\n💡  Troubleshooting tips:');
  console.error('    • Make sure SMTP_PASSWORD is a Gmail App Password (16 chars, no spaces).');
  console.error('    • 2-Step Verification must be enabled on the Gmail account.');
  console.error('    • Allow less secure app access is NOT needed when using App Passwords.');
  console.error('    • Check that smtp.gmail.com:587 is not blocked by your firewall.\n');
  process.exit(1);
} finally {
  transport.close();
}

