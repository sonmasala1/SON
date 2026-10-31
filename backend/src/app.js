import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { requestLogging } from './services/logger.js';
import createRoutes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import mongoose from 'mongoose';

export function safeRequestUrl(req) {
  return req.originalUrl.split('?')[0];
}

export function createApp({ allowedOrigins = ['http://localhost:3000', 'https://son-dusky.vercel.app'], config = {} } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  app.locals.config = {
    mfaEncryptionKey: process.env.STAFF_MFA_ENCRYPTION_KEY || process.env.ADMIN_MFA_ENCRYPTION_KEY,
    customerAuthKey: process.env.CUSTOMER_AUTH_KEY,
    customerAuthKey: process.env.CUSTOMER_AUTH_KEY,
    adminSecurityCodeHash: process.env.ADMIN_SECURITY_CODE_HASH,
    ownerSecurityCodeHash: process.env.OWNER_SECURITY_CODE_HASH,
    crossSiteCookies: process.env.NODE_ENV === 'production'
      ? process.env.SESSION_CROSS_SITE_COOKIES !== 'false'
      : process.env.SESSION_CROSS_SITE_COOKIES === 'true',
    nodeEnv: process.env.NODE_ENV || 'development', deliveryChargePaise: Number(process.env.DELIVERY_CHARGE_PAISE || 4900), freeDeliveryThresholdPaise: Number(process.env.FREE_DELIVERY_THRESHOLD_PAISE || 49900),
    authDevPreview: process.env.AUTH_DEV_PREVIEW === 'true',
    webAuthnRpId: process.env.ADMIN_WEBAUTHN_RP_ID || new URL(config.staffAppOrigin || process.env.STAFF_APP_ORIGIN || (process.env.NODE_ENV === 'production' ? 'https://son-dusky.vercel.app' : 'http://localhost:3000')).hostname, webAuthnOrigin: config.staffAppOrigin || process.env.STAFF_APP_ORIGIN || (process.env.NODE_ENV === 'production' ? 'https://son-dusky.vercel.app' : 'http://localhost:3000'),
    emailProvider: process.env.EMAIL_PROVIDER || 'brevo', brevoApiKey: process.env.BREVO_API_KEY, brevoSenderEmail: process.env.BREVO_SENDER_EMAIL, brevoSenderName: process.env.BREVO_SENDER_NAME || 'SON MASALA',
    twilioSid: process.env.TWILIO_ACCOUNT_SID, twilioToken: process.env.TWILIO_AUTH_TOKEN, smsFrom: process.env.TWILIO_SMS_FROM, whatsappFrom: process.env.TWILIO_WHATSAPP_FROM,
    whatsappOtpContentSid: process.env.TWILIO_WHATSAPP_OTP_CONTENT_SID, smsMessagingServiceSid: process.env.TWILIO_SMS_MESSAGING_SERVICE_SID, smsOtpTemplate: process.env.SMS_OTP_TEMPLATE,
    googleClientId: process.env.GOOGLE_CLIENT_ID, googleClientSecret: process.env.GOOGLE_CLIENT_SECRET, googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || ((process.env.NODE_ENV === 'production') ? 'https://son-5wk9.onrender.com/api/v1/auth/google/callback' : 'http://localhost:5000/api/v1/auth/google/callback'),
    ...config,
  };
  app.locals.allowedOrigins = allowedOrigins;
  app.locals.databaseName = () => mongoose.connection.name;
  app.use(requestLogging);
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(Object.assign(new Error('Origin is not allowed'), { status: 403, logReason: 'cors_origin_rejected' }));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-ID', 'Idempotency-Key'],
    exposedHeaders: ['Retry-After', 'X-Request-ID'],
  }));
  app.use(express.text({ type: 'text/csv', limit: '2mb' }));
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.use('/api/v1', createRoutes());
  app.use((_req, res) => res.status(404).json({ success: false, message: 'Endpoint not found' }));
  app.use(errorHandler);
  return app;
}

export default createApp;
