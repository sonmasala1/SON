export function errorHandler(err, _req, res, _next) {
  // Log only a classification; database errors can contain credential-bearing URIs.
  if (process.env.NODE_ENV !== 'test') console.error('Request failed:', err.name || 'Error', err.status || 500);
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status <= 599
    ? err.status : 500;
  if (err.retryAfter) res.set('Retry-After', String(err.retryAfter));
  const message = status === 503 ? err.expose ? err.message : 'Our catalogue is temporarily unavailable. Please try again shortly.' : status >= 500 ? 'Something went wrong. Please try again.' : err.type === 'entity.parse.failed' ? 'Invalid JSON request' : err.message || 'Request failed';
  res.status(status).json({
    success: false, message, error: message,
  });
}
