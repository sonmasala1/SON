import { z } from 'zod';
import mongoose from 'mongoose';
import { parse } from '../validators/commerce.js';
import { fullName as fullNameSchema } from '../validators/customerAuthentication.js';
import { EmailOtp } from '../models/emailAuthentication.js';
import { sendEmailOtp, verifyEmailCode, activeEmailChallenge } from '../services/emailOtpService.js';
import { createCustomerSession, sendCustomerSession, customerNow, publicCustomer } from '../services/customerSessionService.js';
import { mergeGuestCart } from '../services/cartService.js';
import { httpError } from '../utils/httpError.js';
import User from '../models/User.js';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const sendEmailOtpInput = z.object({
  fullName: fullNameSchema,
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(254, 'Enter a shorter email address.'),
}).strict();

const challengeTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Verification has expired. Please request a new code.');

const verifyEmailOtpInput = z.object({
  challengeToken: challengeTokenSchema,
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit verification code.'),
}).strict();

// ---------------------------------------------------------------------------
// POST /auth/email/send-otp
// ---------------------------------------------------------------------------

export async function requestEmailOtp(req, res, next) {
  try {
    if (req.user) return res.json({ success: true, authenticated: true, user: publicCustomer(req.user) });
    const input = parse(sendEmailOtpInput, req.body);
    res.set('Cache-Control', 'no-store').json({ success: true, ...await sendEmailOtp(req, input) });
  } catch (error) { next(error); }
}

// ---------------------------------------------------------------------------
// POST /auth/email/resend-otp
// ---------------------------------------------------------------------------

export async function resendEmailOtp(req, res, next) {
  try {
    if (req.user) return res.json({ success: true, authenticated: true, user: publicCustomer(req.user) });
    const { challengeToken } = parse(z.object({ challengeToken: challengeTokenSchema }).strict(), req.body);
    const challenge = await activeEmailChallenge(req, challengeToken, { allowExpired: true });
    res.set('Cache-Control', 'no-store').json({ success: true, ...await sendEmailOtp(req, { fullName: challenge.fullName, email: challenge.email }) });
  } catch (error) { next(error); }
}

// ---------------------------------------------------------------------------
// POST /auth/email/verify-otp
// ---------------------------------------------------------------------------

export async function verifyEmailOtp(req, res, next) {
  try {
    const input = parse(verifyEmailOtpInput, req.body);
    const challenge = await verifyEmailCode(req, input.challengeToken, input.code);

    let user, result;
    for (let attempt = 0; ; attempt++) {
      try {
        await mongoose.connection.transaction(async session => {
          // Atomically consume the OTP
          const consumed = await EmailOtp.updateOne(
            { _id: challenge._id, status: 'ACTIVE', attempts: { $lt: 5 }, expiresAt: { $gt: new Date(customerNow(req)) } },
            { status: 'USED', usedAt: new Date(customerNow(req)) },
            { session },
          );
          if (!consumed.modifiedCount) throw httpError(401, 'This code was already used or expired. Please request a new code.');

          // Upsert customer account by email
          const existing = await User.find({ email: challenge.email }).limit(2).session(session);
          if (existing.length > 1) throw httpError(409, 'This email address needs an account review. Please contact support.');

          user = await User.findOneAndUpdate(
            existing.length ? { _id: existing[0]._id } : { email: challenge.email },
            {
              $setOnInsert: { name: challenge.fullName, role: 'CUSTOMER', accountStatus: 'ACTIVE' },
              $set: { email: challenge.email, lastLoginAt: new Date(customerNow(req)), emailVerified: true, emailVerifiedAt: new Date(customerNow(req)), emailVerificationSource: 'SMTP' },
            },
            { upsert: true, new: true, runValidators: true, session },
          );

          if (['SUSPENDED', 'DELETED'].includes(user.accountStatus)) throw httpError(403, 'This account is unavailable. Please contact support.');

          await mergeGuestCart(req, user, session);
          result = await createCustomerSession(req, user, 'SMTP', session);
        });
        break;
      } catch (error) {
        if (error.code === 11000 && attempt < 2) continue;
        throw error;
      }
    }

    sendCustomerSession(req, res, result);
    res.set('Cache-Control', 'no-store').json({ success: true, user: publicCustomer(user) });
  } catch (error) { next(error); }
}

