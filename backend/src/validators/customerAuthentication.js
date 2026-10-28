import { z } from 'zod';
// eslint-disable-next-line no-control-regex -- Full names intentionally reject non-printing ASCII controls.
export const fullName = z.string().trim().transform(value => value.normalize('NFC').replace(/\s+/gu, ' ')).pipe(z.string().min(2, 'Enter your full name.').max(100, 'Use 100 characters or fewer.')).refine(value => !/[\u0000-\u001f\u007f]/u.test(value), 'Enter a valid full name.');
export const indianPhone = z.string().trim().regex(/^(?:\+91)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number.').transform(value => value.startsWith('+91') ? value : `+91${value}`);
export const sendOtpInput = z.object({ fullName, phone: indianPhone, channel: z.enum(['sms', 'whatsapp']) }).strict();
export const challengeTokenInput = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Verification has expired. Please request a new code.');
export const verifyOtpInput = z.object({ challengeToken: challengeTokenInput, code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit verification code.') }).strict();
