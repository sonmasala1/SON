import { Router } from 'express';
import { getHealth, getReadiness } from '../controllers/healthController.js';
import { getProducts, getProduct } from '../controllers/productController.js';
import { subscribe } from '../controllers/newsletterController.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import rateLimit from 'express-rate-limit';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import { storefrontFilter } from '../services/productService.js';
import { identifyCustomer, requireCustomer } from '../middleware/session.js';
import { showCart, addCartItem, updateCartItem, removeCartItem } from '../controllers/cartController.js';
import { me, passwordAuthenticationRetired, logout, customerOrders, revokeOtherCustomerSessions } from '../controllers/authController.js';
import { previewCheckout, placePayLaterOrder, showCheckoutAttempt, cancelCustomerOrder, showOrder } from '../controllers/checkoutController.js';
import { getReviews, createReview } from '../controllers/reviewController.js';
import { staffRouter } from './staff.js';
import { requestCustomerOtp, verifyCustomerOtp, resendCustomerOtp } from '../controllers/customerOtpController.js';
import { requestEmailOtp, verifyEmailOtp, resendEmailOtp } from '../controllers/emailOtpController.js';
import { customerOrigin } from '../services/customerSessionService.js';
import { startGoogleLogin, googleLoginCallback } from '../controllers/googleAuthController.js';
import { showWishlist, changeWishlist } from '../controllers/wishlistController.js';

export default function createRoutes() {
const router = Router();
router.use('/admin', staffRouter('admin'));
router.get('/health', getHealth);
router.get('/ready', getReadiness);
router.get('/products', requireDatabase, getProducts);
router.get('/products/:slug', requireDatabase, getProduct);
router.post('/newsletter', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Please try again later.' } }), requireDatabase, subscribe);
router.get('/categories', requireDatabase, async (req, res, next) => {
  try {
    const slugs = await Product.distinct('category', storefrontFilter(false, false));
    res.json({ success: true, categories: await Category.find({ slug: { $in: slugs }, status: { $ne: 'archived' } }).sort({ sort: 1 }).lean() });
  } catch (error) { next(error); }
});
router.get('/reviews', requireDatabase, getReviews);
router.use(['/cart', '/auth', '/wishlist', '/checkout', '/orders', '/reviews'], requireDatabase, identifyCustomer);
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: req => req.app.locals.config.nodeEnv === 'test' ? 1000 : 30, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many sign-in attempts. Please try again later.' } });
router.use(['/auth', '/cart', '/wishlist', '/checkout', '/orders'], (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.get('/auth/me', me);
router.post(['/auth/register', '/auth/login'], authLimit, customerOrigin, passwordAuthenticationRetired);
router.post('/auth/logout', customerOrigin, logout);
router.post(['/auth/send-otp', '/auth/otp/request'], authLimit, customerOrigin, requestCustomerOtp);
router.post(['/auth/verify-otp', '/auth/otp/verify'], authLimit, customerOrigin, verifyCustomerOtp);
router.post('/auth/resend-otp', authLimit, customerOrigin, resendCustomerOtp);
// Email OTP routes
router.post('/auth/email/send-otp',    authLimit, customerOrigin, requestEmailOtp);
router.post('/auth/email/verify-otp',  authLimit, customerOrigin, verifyEmailOtp);
router.post('/auth/email/resend-otp',  authLimit, customerOrigin, resendEmailOtp);
router.post('/auth/google/start', authLimit, customerOrigin, startGoogleLogin);
router.get('/auth/google/callback', authLimit, googleLoginCallback);
router.get('/auth/orders', requireCustomer, customerOrders);
router.post('/auth/revoke-other-sessions', requireCustomer, customerOrigin, revokeOtherCustomerSessions);
router.get('/cart', showCart);
router.post('/cart/items', customerOrigin, addCartItem);
router.patch('/cart/items/:id', customerOrigin, updateCartItem);
router.delete('/cart/items/:id', customerOrigin, removeCartItem);
router.get('/wishlist', requireCustomer, showWishlist);
router.put('/wishlist/:slug', requireCustomer, customerOrigin, changeWishlist);
router.delete('/wishlist/:slug', requireCustomer, customerOrigin, changeWishlist);
router.post('/checkout/preview', requireCustomer, customerOrigin, previewCheckout);
router.post('/checkout/place', requireCustomer, customerOrigin, placePayLaterOrder);
router.get('/checkout/attempts/:requestKey', requireCustomer, showCheckoutAttempt);
router.patch('/orders/:id/cancel', requireCustomer, customerOrigin, cancelCustomerOrder);
router.get('/orders/:id', requireCustomer, showOrder);
router.post('/reviews', requireCustomer, createReview);

return router;
}
