import rateLimit from 'express-rate-limit';

// Instantiate per app so isolated applications do not share counters.
export function reviewLimiters() {
  const options = { standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many review attempts. Please try again later.' } };
  return [
    rateLimit({ ...options, windowMs: 60 * 60 * 1000, max: 20 }),
    rateLimit({ ...options, windowMs: 15 * 60 * 1000, max: 5, keyGenerator: req => String(req.user._id) }),
  ];
}
