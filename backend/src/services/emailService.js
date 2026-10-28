import nodemailer from 'nodemailer';

/**
 * Send an OTP email using the SMTP config stored in app.locals.config.
 * Never logs the password or the OTP value.
 *
 * @param {import('express').Request} req
 * @param {{ to: string, code: string }} options
 */
export async function sendOtpEmail(req, { to, code }) {
  const c = req.app.locals.config;
  if (!c.smtpHost || !c.smtpUser || !c.smtpPassword || !c.smtpFrom) {
    throw Object.assign(new Error('Email delivery is not configured. Please contact support.'), { status: 503 });
  }

  const transport = nodemailer.createTransport({
    host: c.smtpHost,
    port: c.smtpPort || 587,
    secure: (c.smtpPort || 587) === 465,
    requireTLS: true,
    auth: { user: c.smtpUser, pass: c.smtpPassword },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  try {
    await transport.sendMail({
      from: c.smtpFrom,
      to,
      subject: 'Your SON MASALA verification code',
      text: [
        `Your SON MASALA verification code is: ${code}`,
        '',
        'This code expires in 5 minutes.',
        'Do not share this code with anyone.',
        '',
        'If you did not request this, you can safely ignore this email.',
        '',
        '— SON MASALA Team',
      ].join('\n'),
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f0eb;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="min-height:100vh;background:#f5f0eb">
    <tr><td align="center" style="padding:40px 16px">
      <table width="100%" style="max-width:480px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
        <!-- Header -->
        <tr><td style="background:#c0392b;padding:28px 32px;text-align:center">
          <h1 style="margin:0;color:#fff;font-size:26px;letter-spacing:2px">SON MASALA</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,.8);font-size:13px;letter-spacing:1px">हर स्वाद में अपनापन</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 32px">
          <p style="margin:0 0 8px;color:#333;font-size:15px">Hello,</p>
          <p style="margin:0 0 28px;color:#555;font-size:14px;line-height:1.6">
            Use the verification code below to sign in to your SON MASALA account.
            This code is valid for <strong>5 minutes</strong>.
          </p>
          <!-- OTP Box -->
          <div style="background:#fff8f0;border:2px dashed #c0392b;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px">
            <p style="margin:0 0 6px;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px">Verification Code</p>
            <p style="margin:0;font-size:42px;font-weight:700;letter-spacing:10px;color:#c0392b;font-family:monospace">${code}</p>
          </div>
          <p style="margin:0 0 8px;color:#888;font-size:13px;line-height:1.5">
            ⚠️ <strong>Do not share this code with anyone.</strong> SON MASALA will never ask for your verification code.
          </p>
          <p style="margin:0;color:#aaa;font-size:12px">If you did not request this code, you can safely ignore this email.</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#faf6f2;padding:20px 32px;border-top:1px solid #f0e8e0;text-align:center">
          <p style="margin:0;color:#aaa;font-size:12px">© ${new Date().getFullYear()} SON MASALA. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });
  } catch {
    throw Object.assign(new Error('Email delivery is unavailable. Please try again later.'), { status: 503 });
  } finally {
    transport.close();
  }
}

