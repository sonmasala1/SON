import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const context = new AsyncLocalStorage();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const events = new Set(['email.api.request', 'email.api.accepted', 'email.api.failed', 'order.created', 'order.stock.reserved', 'order.cancelled', 'cart.calculated', 'api.request', 'api.aborted', 'server.started', 'server.stopping', 'server.start_failed', 'server.bind_failed', 'server.cleanup_failed', 'server.exception', 'database.connected', 'database.reconnected', 'database.disconnected', 'database.error', 'database.configuration_error', 'otp.dispatch.succeeded', 'otp.dispatch.failed', 'otp.idempotency.replayed', 'otp.idempotency.pending', 'customer.authentication.succeeded', 'customer.session.rejected', 'google.callback.failed']);
const reasons = new Set(['cors_origin_rejected', 'csrf_origin_rejected', 'csrf_token_rejected', 'session_invalid', 'session_expired_or_revoked', 'account_unavailable', 'session_renewal_failed', 'credentials_or_account_unavailable', 'mfa_invalid_or_replayed', 'database_unavailable', 'configuration_missing', 'delivery_failed', 'state', 'cancelled', 'account_link_required', 'failed', 'rate_limited', 'validation_failed', 'unauthorized', 'forbidden', 'not_found', 'conflict', 'server_error', 'request_failed', 'aborted', 'brevo_rate_limited', 'brevo_authentication', 'brevo_permission', 'brevo_ip_restricted', 'brevo_sender_invalid', 'brevo_unavailable', 'brevo_rejected', 'brevo_response_invalid', 'brevo_timeout']);
const operations = new Map([
  ['/auth/email/send-otp', 'email_otp.request'], ['/auth/email/resend-otp', 'email_otp.resend'], ['/auth/email/verify-otp', 'email_otp.verify'],
  ['/auth/send-otp', 'mobile_otp.request'], ['/auth/otp/request', 'mobile_otp.request'], ['/auth/resend-otp', 'mobile_otp.resend'], ['/auth/verify-otp', 'mobile_otp.verify'], ['/auth/otp/verify', 'mobile_otp.verify'],
  ['/auth/google/start', 'google.start'], ['/auth/google/callback', 'google.callback'], ['/auth/logout', 'customer.logout'], ['/auth/me', 'customer.session'], ['/auth/orders', 'customer.orders'],
]);

export function safeRoute(req) {
  const path = String(req.originalUrl || '').split('?')[0];
  const realm = /^\/api\/v1\/(owner|admin)(?:\/|$)/.exec(path)?.[1];
  // These are server-owned route templates, never raw parameter values.
  const template = req.route?.path;
  if (typeof template === 'string' && template.startsWith('/')) return `/api/v1${realm ? `/${realm}` : ''}${template}`;
  const relative = path.replace(/^\/api\/v1/, '');
  if (operations.has(relative) || ['/health', '/ready', '/products', '/cart', '/cart/items', '/checkout/preview', '/demo-payments', '/categories', '/reviews', '/newsletter', '/wishlist'].includes(relative)) return `/api/v1${relative}`;
  if (realm && /^\/(owner|admin)\/auth\/(?:login|logout|me|mfa\/verify|passkeys\/(?:options|verify))$/.test(relative)) return `/api/v1${relative}`;
  if (realm && /^\/(owner|admin)\/(?:dashboard|orders|products|customers|inventory|payments|shipping|analytics|reviews)$/.test(relative)) return `/api/v1${relative}`;
  for (const prefix of ['/products/', '/orders/', '/cart/items/', '/wishlist/']) if (relative.startsWith(prefix)) return `/api/v1${prefix}:id`;
  return '/api/v1/:unmatched';
}

function operation(req) {
  const route = safeRoute(req).replace(/^\/api\/v1/, '');
  if (operations.has(route)) return operations.get(route);
  const staff = /^\/(owner|admin)\/auth\/(.+)$/.exec(route);
  if (staff) return `${staff[1]}.${staff[2].replaceAll('/', '.')}`;
  return ['products', 'cart', 'checkout', 'orders', 'wishlist', 'reviews', 'categories', 'demo-payments'].find(group => route.startsWith(`/${group}`)) || 'api';
}

const safeProviderCodes = new Set([
  'unauthorized', 'permission_denied', 'invalid_parameter', 'missing_parameter',
  'account_under_validation', 'not_enough_credits', 'rate_limited', 'bad_request',
  'method_not_allowed', 'document_not_found', 'reseller_permission_denied',
  'smtp_key_detected', 'server_error', 'unknown'
]);

// Allowlisted metadata only: bodies, headers, errors, URLs and identities are never serialized.
export function logEvent(level, event, fields = {}, explicitReq) {
  if (!events.has(event)) return;
  const req = explicitReq || context.getStore()?.req;
  const record = { timestamp: new Date().toISOString(), level: ['INFO', 'WARN', 'ERROR'].includes(level) ? level : 'INFO', service: 'son-masala-api', event };
  record.severity = { INFO: 'info', WARN: 'warning', ERROR: 'error' }[record.level];
  if (req?.requestId) record.requestId = req.requestId;
  if (req) { record.method = methods.has(req.method) ? req.method : 'OTHER'; record.route = safeRoute(req); record.operation = operation(req); }
  for (const key of ['status', 'durationMs', 'port', 'retryMs', 'subtotalPaise', 'discountPaise', 'deliveryPaise', 'totalPaise', 'itemCount']) if (Number.isFinite(fields[key]) && fields[key] >= 0) record[key] = fields[key];
  if (reasons.has(fields.reason)) record.reason = fields.reason;
  if (['BREVO', 'SMTP', 'SMS', 'WHATSAPP', 'GOOGLE', 'TEST', 'DEVELOPMENT_PREVIEW'].includes(fields.source)) record.source = fields.source;
  if (['registration', 'login'].includes(fields.authAction)) record.authAction = fields.authAction;
  if (['development', 'test', 'production'].includes(fields.environment)) record.environment = fields.environment;
  if (['EADDRINUSE', 'ECONNREFUSED', 'ETIMEDOUT', 'EAUTH', 'ENOTFOUND', 'DATABASE_NAME_REQUIRED', 'DATABASE_CONTENT_MISMATCH', 'MONGODB_URI_INVALID'].includes(fields.code)) record.code = fields.code;
  if (['database_configuration', 'database_tls', 'database_authentication', 'database_dns', 'database_index_conflict', 'database_network', 'database_selection_timeout', 'database_content_mismatch', 'brevo_smtp_key_detected'].includes(fields.diagnostic)) record.diagnostic = fields.diagnostic;
  if (safeProviderCodes.has(fields.providerCode)) record.providerCode = fields.providerCode;

  const sink = req?.app?.locals?.config?.nodeEnv === 'test' && req.app.locals.config.testLogSink;
  try {
    if (sink) {
      sink(record);
    } else if (process.env.LOG_FORMAT === 'simple' || (req?.app?.locals?.config?.nodeEnv || process.env.NODE_ENV) === 'development') {
      const ts = record.timestamp ? record.timestamp.slice(11, 19) : '';
      const debug = process.env.DEBUG === 'true' || process.env.LOG_LEVEL === 'DEBUG';
      if (event === 'api.request' && req?.method === 'OPTIONS' && !debug) return;
      if (!debug && ['email.api.request', 'email.api.accepted', 'email.api.failed'].includes(event)) return;
      if (event === 'api.request') {
        const levelName = record.status >= 500 ? 'ERROR' : record.status >= 400 ? 'ERROR' : 'INFO';
        const reasonLabels = {
          cors_origin_rejected: 'Origin not allowed',
          brevo_authentication: 'Brevo authentication failed',
          database_unavailable: 'Database unavailable',
        };
        const statusText = record.status >= 400 ? (reasonLabels[record.reason] || (record.reason || 'request failed').replaceAll('_', ' ')) : 'OK';
        process.stdout.write(`[${record.status} ${levelName}] ${record.method} ${record.route} — ${statusText} (${record.durationMs}ms) [${req.requestId}]\n`);
      } else if (event === 'server.started') {
        process.stdout.write(`[INFO] Server started on port ${record.port}\n`);
      } else if (event === 'database.connected') {
        process.stdout.write('[INFO] MongoDB connected\n');
      } else {
        process.stdout.write(`[${ts}] [${record.level}] ${record.event}${record.status ? ` status=${record.status}` : ''}${record.reason ? ` reason=${record.reason}` : ''}${record.providerCode ? ` code=${record.providerCode}` : ''}\n`);
      }
    } else {
      process.stdout.write(`${JSON.stringify(record)}\n`);
    }
  } catch { /* Logging cannot break authentication or API responses. */ }
}

export function requestLogging(req, res, next) {
  const incoming = req.get('X-Request-ID');
  req.requestId = typeof incoming === 'string' && uuid.test(incoming) ? incoming.toLowerCase() : randomUUID();
  res.set('X-Request-ID', req.requestId);
  const start = performance.now();
  let recorded = false;
  function complete(aborted = false) {
    if (recorded) return;
    recorded = true;
    const status = aborted ? 499 : res.statusCode;
    const reason = aborted ? 'aborted' : req.logFailure || (status === 429 ? 'rate_limited' : undefined);
    logEvent(status >= 500 ? 'ERROR' : status >= 400 || reason ? 'WARN' : 'INFO', aborted ? 'api.aborted' : 'api.request', { status, durationMs: Math.round((performance.now() - start) * 100) / 100, reason }, req);
  }
  res.once('finish', () => complete());
  res.once('close', () => { if (!res.writableFinished) complete(true); });
  context.run({ req }, next);
}

export function failureReason(status) {
  return ({ 400: 'validation_failed', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 422: 'validation_failed', 429: 'rate_limited', 503: 'database_unavailable' })[status] || (status >= 500 ? 'server_error' : 'request_failed');
}
