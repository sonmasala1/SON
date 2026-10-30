// Shared by Next's configuration and browser bundle to prevent routing drift.
function resolveApiBaseUrl({ nodeEnv, configuredUrl, productionUrl = process.env.NEXT_PUBLIC_PRODUCTION_API_BASE_URL || 'https://son-5wk9.onrender.com/api/v1' }) {
  const production = nodeEnv === 'production';
  if (production && !configuredUrl) throw new Error('Set NEXT_PUBLIC_API_BASE_URL in Vercel before building for production.');
  let url;
  let configuredHostname = '';
  try { configuredHostname = configuredUrl ? new URL(configuredUrl).hostname : ''; } catch { /* Validated below. */ }
  const selectedUrl = production && (!configuredUrl || ['localhost', '127.0.0.1', '[::1]'].includes(configuredHostname))
    ? productionUrl
    : (configuredUrl || 'http://localhost:5000/api/v1');
  try { url = new URL(selectedUrl); }
  catch { throw new Error('NEXT_PUBLIC_API_BASE_URL must be a valid API URL.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/+$/, '') !== '/api/v1') {
    throw new Error('NEXT_PUBLIC_API_BASE_URL must end in /api/v1, without credentials, query parameters, or fragments.');
  }
  if (production && (loopback || url.protocol !== 'https:')) throw new Error('Production requires an HTTPS backend URL, never localhost.');
  if (!production && !loopback) throw new Error('Local development must use the local backend. Set NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api/v1 in frontend/.env.');
  return url.toString().replace(/\/+$/, '');
}

module.exports = { resolveApiBaseUrl };
