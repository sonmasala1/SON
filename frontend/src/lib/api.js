import apiConfiguration from '../../config/api-base';
export const API_BASE_URL = apiConfiguration.resolveApiBaseUrl({ nodeEnv: process.env.NODE_ENV, configuredUrl: process.env.NEXT_PUBLIC_API_BASE_URL });
const validRequestId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

export function apiUrl(endpoint) {
  const path = endpoint.replace(/^\/+/, '').replace(/^api\/v1\/?/, '');
  const base = typeof window !== 'undefined' && process.env.NEXT_PUBLIC_API_PROXY === 'true' ? '/api/v1' : API_BASE_URL;
  return `${base}/${path}`;
}

export class ApiError extends Error {
  constructor(message, status = 0, requestId) { super(message); this.name = 'ApiError'; this.status = status; this.requestId = requestId; }
}

const inFlightGets = new Map();

export function apiRequest(endpoint, requestOptions = {}) {
  const method = String(requestOptions.method || 'GET').toUpperCase();
  if (method !== 'GET' || requestOptions.signal?.aborted) return apiRequestNow(endpoint, requestOptions);
  const key = `${apiUrl(endpoint)}|${requestOptions.headers?.['X-CSRF-Token'] || ''}`;
  if (inFlightGets.has(key)) return inFlightGets.get(key);
  const request = apiRequestNow(endpoint, requestOptions).finally(() => inFlightGets.delete(key));
  inFlightGets.set(key, request);
  return request;
}

async function apiRequestNow(endpoint, { timeout = 10000, signal, ...options } = {}) {
  const requestId = crypto.randomUUID();
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
  let url;
  try {
    const base = new URL(API_BASE_URL);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Invalid API protocol');
    url = apiUrl(endpoint);
    const response = await fetch(url, { ...options, credentials: 'include', headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers, 'X-Request-ID': requestId }, signal: controller.signal });
    const data = await response.json().catch(() => null);
    const returnedId = response.headers.get('X-Request-ID');
    const correlationId = validRequestId(returnedId) ? returnedId : requestId;
    if (!response.ok) { const error = new ApiError(`HTTP ${response.status}: ${data?.message || 'The request could not be completed.'}`, response.status, correlationId); error.retryAfter = Number(response.headers.get('Retry-After')) || 0; error.requiresProfile = Boolean(data?.requiresProfile); throw error; }
    if (!data || data.success === false) throw new ApiError('The server returned an unexpected response.', response.status, correlationId);
    return data;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (process.env.NODE_ENV === 'development') console.warn('[SON MASALA API]', JSON.stringify({ event: 'api.failure', requestId: error.requestId || requestId, status: error.status || 0, apiOrigin: new URL(API_BASE_URL).origin, reason: timedOut ? 'timeout' : error instanceof ApiError ? 'http_error' : 'network_error' }));
    if (error instanceof ApiError) throw error;
    throw new ApiError(timedOut ? 'The request took too long. Please try again.' : 'We couldn’t reach the store. Please check your connection and try again.', 0, requestId);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export const getHealth = (options) => apiRequest('health', options);
export const getReadiness = (options) => apiRequest('ready', options);
export function getProducts(query = {}, options) {
  const search = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== '' && value != null));
  return apiRequest(`products?${search}`, options);
}
export const getCategories = options => apiRequest('categories', options);
export const getProduct = (slug, options) => apiRequest(`products/${encodeURIComponent(slug)}`, options);
export const subscribe = (email, consent) => apiRequest('newsletter', { method: 'POST', body: JSON.stringify({ email, consent }) });
export const getCart = () => apiRequest('cart');
export const addCartItem = (productId, variantId, quantity = 1) => apiRequest('cart/items', { method: 'POST', body: JSON.stringify({ productId, variantId, quantity }) });
export const updateCartItem = (id, quantity) => apiRequest(`cart/items/${id}`, { method: 'PATCH', body: JSON.stringify({ quantity }) });
export const removeCartItem = id => apiRequest(`cart/items/${id}`, { method: 'DELETE' });
export const authRequest = (action, data = {}) => apiRequest(`auth/${action}`, { method: 'POST', body: JSON.stringify(data) });
export const previewCheckout = delivery => apiRequest('checkout/preview', { method: 'POST', body: JSON.stringify(delivery ? { delivery } : {}) });
export const placePayLaterOrder = data => apiRequest('checkout/place', { method: 'POST', body: JSON.stringify(data), timeout: 20000 });
export const demoPayment = data => apiRequest('demo-payments', { method: 'POST', body: JSON.stringify(data), timeout: 20000 });
export const getOrder = id => apiRequest(`orders/${encodeURIComponent(id)}`);
export const getReviews = productId => apiRequest(`reviews${productId ? `?productId=${productId}` : ''}`);
