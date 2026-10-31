// Shared by Next's configuration and browser bundle to prevent routing drift.
function resolveApiBaseUrl({ nodeEnv, configuredUrl, productionUrl = process.env.NEXT_PUBLIC_PRODUCTION_API_BASE_URL || 'https://son-5wk9.onrender.com/api/v1' }) {
  const production = nodeEnv === 'production';
  let url;
  let configuredHostname = '';
  try { configuredHostname = configuredUrl ? new URL(configuredUrl).hostname : ''; } catch { /* Validated below. */ }
  if (configuredUrl) {
    try {
      const configured = new URL(configuredUrl);
      if (!production && !['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname)) {
        throw new Error('Local development must use the local backend.');
      }
      if (configured.username || configured.password || configured.search || configured.hash || configured.pathname.replace(/\/+$/, '') !== '/api/v1') {
        throw new Error('NEXT_PUBLIC_API_BASE_URL must end in /api/v1, without credentials, query parameters, or fragments.');
      }
    } catch (error) {
      if (error.message === 'Local development must use the local backend.') throw error;
      throw new Error('NEXT_PUBLIC_API_BASE_URL must end in /api/v1, without credentials, query parameters, or fragments.');
    }
  }
  let selectedUrl = production
    ? (['localhost', '127.0.0.1', '[::1]'].includes(configuredHostname) ? productionUrl : (configuredUrl || productionUrl))
    : 'http://localhost:5000/api/v1';
  try { url = new URL(selectedUrl); }
  catch { throw new Error('NEXT_PUBLIC_API_BASE_URL must be a valid API URL.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/+$/, '') !== '/api/v1') {
    throw new Error('NEXT_PUBLIC_API_BASE_URL must end in /api/v1, without credentials, query parameters, or fragments.');
  }
  if (production && (loopback || url.protocol !== 'https:')) throw new Error('Production requires an HTTPS backend URL, never localhost.');
  if (!production && !loopback) throw new Error('Local development must use the localhost Express backend.');
  return url.toString().replace(/\/+$/, '');
}

module.exports = { resolveApiBaseUrl };
