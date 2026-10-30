import mongoose from 'mongoose';
import { z } from 'zod';
import User from '../models/User.js';
import { parse } from '../validators/commerce.js';
import { CustomerOtp } from '../models/customerAuthentication.js';
import { sendOtpInput, verifyOtpInput, challengeTokenInput } from '../validators/customerAuthentication.js';
import { sendCustomerOtp, verifyCustomerCode, activeCustomerChallenge } from '../services/customerOtpService.js';
import { createCustomerSession, sendCustomerSession, customerNow, publicCustomer } from '../services/customerSessionService.js';
import { mergeGuestCart } from '../services/cartService.js';
import { httpError } from '../utils/httpError.js';

export async function requestCustomerOtp(req, res, next) {
  try {
    if (req.user) return res.json({ success: true, authenticated: true, user: publicCustomer(req.user) });
    const input = parse(sendOtpInput, req.body);
    res.set('Cache-Control', 'no-store').json({ success: true, ...await sendCustomerOtp(req, input) });
  } catch (error) { next(error); }
}
export async function resendCustomerOtp(req, res, next) {
  try {
    if (req.user) return res.json({ success: true, authenticated: true, user: publicCustomer(req.user) });
    const { challengeToken } = parse(z.object({ challengeToken: challengeTokenInput }).strict(), req.body);
    const challenge = await activeCustomerChallenge(req, challengeToken, { allowExpired: true });
    res.json({ success: true, ...await sendCustomerOtp(req, challenge) });
  } catch (error) { next(error); }
}
export async function verifyCustomerOtp(req, res, next) {
  try {
    const input = parse(verifyOtpInput, req.body);
    const challenge = await verifyCustomerCode(req, input.challengeToken, input.code);
    let user, result;
    for (let attempt = 0; ; attempt++) {
      try {
        await mongoose.connection.transaction(async session => {
          const consumed = await CustomerOtp.updateOne({ _id: challenge._id, status: 'ACTIVE', attempts: { $lte: 5 }, expiresAt: { $gt: new Date(customerNow(req)) } }, { status: 'USED', usedAt: new Date(customerNow(req)) }, { session });
          if (!consumed.modifiedCount) throw httpError(401, 'This code was already used or expired. Please request a new code.');
          const preview = challenge.deliverySource === 'DEVELOPMENT_PREVIEW';
          const national = challenge.phone.slice(3);
          const existing = await User.find({ phone: { $in: [challenge.phone, national, `91${national}`] } }).limit(2).session(session);
          req.customerAuthAction = existing.length ? 'login' : 'registration';
          if (existing.length > 1) throw httpError(409, 'This mobile number needs an account review. Please contact support.');
          user = await User.findOneAndUpdate(existing.length ? { _id: existing[0]._id } : { phone: challenge.phone }, {
            $setOnInsert: { name: challenge.fullName, role: 'CUSTOMER', accountStatus: 'ACTIVE' },
            $set: { phone: challenge.phone, lastLoginAt: new Date(customerNow(req)), ...!preview ? { phoneVerified: true, phoneVerifiedAt: new Date(customerNow(req)), phoneVerificationSource: challenge.deliverySource } : {} },
          }, { upsert: true, new: true, runValidators: true, session });
          if (['SUSPENDED', 'DELETED'].includes(user.accountStatus)) throw httpError(403, 'This account is unavailable. Please contact support.');
          if (preview && !user.phoneVerificationSource) { user.phoneVerificationSource = 'DEVELOPMENT_PREVIEW'; await user.save({ session }); }
          await mergeGuestCart(req, user, session);
          result = await createCustomerSession(req, user, challenge.deliverySource, session);
        });
        break;
      } catch (error) { if (error.code === 11000 && attempt < 2) continue; throw error; }
    }
    sendCustomerSession(req, res, result);
    res.set('Cache-Control', 'no-store').json({ success: true, user: publicCustomer(user) });
  } catch (error) { next(error); }
}
