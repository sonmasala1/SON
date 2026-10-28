import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import createRoutes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import mongoose from 'mongoose';

export function safeRequestUrl(req) {
  const pathname = req.originalUrl.split('?')[0];
  return /^\/api\/v1\/auth\/google\/callback\/*$/i.test(pathname) ? pathname : req.originalUrl;
}

export function createApp({ allowedOrigins = ['http://localhost:3000', 'http://localhost:3001'], config = {} } = {}) {
  const app = express();
  app.locals.config = {
    nodeEnv: process.env.NODE_ENV || 'development', demoEnabled: process.env.ENABLE_DEMO_CHECKOUT === 'true', deliveryChargePaise: 4900, freeDeliveryThresholdPaise: 49900,
    mfaEncryptionKey: process.env.ADMIN_MFA_ENCRYPTION_KEY, authDevPreview: process.env.AUTH_DEV_PREVIEW === 'true',
    webAuthnRpId: process.env.ADMIN_WEBAUTHN_RP_ID || 'localhost', webAuthnOrigin: process.env.STAFF_APP_ORIGIN || 'http://localhost:3000',
    smtpHost: process.env.SMTP_HOST, smtpPort: Number(process.env.SMTP_PORT || 587), smtpUser: process.env.SMTP_USER, smtpPassword: process.env.SMTP_PASSWORD, smtpFrom: process.env.SMTP_FROM,
    twilioSid: process.env.TWILIO_ACCOUNT_SID, twilioToken: process.env.TWILIO_AUTH_TOKEN, smsFrom: process.env.TWILIO_SMS_FROM, whatsappFrom: process.env.TWILIO_WHATSAPP_FROM,
    whatsappOtpContentSid: process.env.TWILIO_WHATSAPP_OTP_CONTENT_SID, smsMessagingServiceSid: process.env.TWILIO_SMS_MESSAGING_SERVICE_SID, smsOtpTemplate: process.env.SMS_OTP_TEMPLATE,
    googleClientId: process.env.GOOGLE_CLIENT_ID, googleClientSecret: process.env.GOOGLE_CLIENT_SECRET, googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/v1/auth/google/callback',
    ...config,
  };
  app.locals.allowedOrigins = allowedOrigins;
  app.locals.databaseName = () => mongoose.connection.name;
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(Object.assign(new Error('Origin is not allowed'), { status: 403 }));
    },
    credentials: true,
  }));
  app.use(express.text({ type: 'text/csv', limit: '2mb' }));
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  morgan.token('safe-url', safeRequestUrl);
  app.use(morgan(':method :safe-url :status :response-time ms - :res[content-length]'));
  app.use('/api/v1', createRoutes());
  app.use((_req, res) => res.status(404).json({ success: false, message: 'Endpoint not found' }));
  app.use(errorHandler);
  return app;
}

export default createApp;
