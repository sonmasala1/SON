// Public email entry point. All authentication email uses Brevo HTTPS.
export { sendOtpEmail, sendTransactionalEmail, otpEmailTemplate, escapeEmailHtml } from './brevoEmailService.js';
