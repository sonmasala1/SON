import { z } from 'zod';
import Subscriber from '../models/Subscriber.js';

const schema = z.object({ email: z.string().trim().email().max(254), consent: z.literal(true) });

export async function subscribe(req, res, next) {
  const result = schema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ success: false, message: 'Enter a valid email and agree to receive our newsletter.' });
  try {
    await Subscriber.updateOne({ email: result.data.email.toLowerCase() }, { $setOnInsert: result.data }, { upsert: true, runValidators: true });
    res.json({ success: true, message: 'You’re on the list. Thank you for joining our kitchen.' });
  } catch (error) {
    if (error.code === 11000) return res.json({ success: true, message: 'You’re on the list. Thank you for joining our kitchen.' });
    next(Object.assign(error, { status: 503 }));
  }
}
