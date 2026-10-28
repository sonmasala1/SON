export function errorHandler(err, req, res, _next) {
  // Log only a classification; database errors can contain credential-bearing URIs.
  if (process.env.NODE_ENV !== 'test') console.error('Request failed:', err.name || 'Error', err.status || 500);
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status <= 599
    ? err.status : 500;
  if (err.retryAfter) res.set('Retry-After', String(err.retryAfter));

  // If this is the Google OAuth callback, never show raw JSON error in browser; redirect to frontend login
  if (req?.originalUrl && req.originalUrl.includes('/auth/google/callback')) {
    const frontend = req.app?.locals?.config?.webAuthnOrigin || 'http://localhost:3000';
    const target = new URL('/login', frontend);
    target.searchParams.set('google_error', status === 503 ? 'database_unavailable' : 'failed');
    return res.redirect(303, target.toString());
  }

  const message = status === 503 ? err.expose ? err.message : 'Our catalogue is temporarily unavailable. Please try again shortly.' : status >= 500 ? 'Something went wrong. Please try again.' : err.type === 'entity.parse.failed' ? 'Invalid JSON request' : err.message || 'Request failed';
  res.status(status).json({
    success: false, message, error: message,
  });
}
