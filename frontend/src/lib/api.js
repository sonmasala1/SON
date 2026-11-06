import apiConfiguration from '../../config/api-base';
import { publicRequest } from './public-cache';
export const API_BASE_URL = apiConfiguration.resolveApiBaseUrl({ nodeEnv: process.env.NODE_ENV, configuredUrl: process.env.NEXT_PUBLIC_API_BASE_URL });
const validRequestId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

export function apiUrl(endpoint) {
  const path = endpoint.replace(/^\/+/, '').replace(/^api\/v1\/?/, '');
  // A single local origin also works in WebKit and on phones opening the dev server.
  const proxy = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_API_PROXY === 'true';
  const base = typeof window !== 'undefined' && proxy ? '/api/v1' : API_BASE_URL;
  return `${base}/${path}`;
}

export class ApiError extends Error {
  constructor(message, status = 0, requestId) { super(message); this.name = 'ApiError'; this.status = status; this.requestId = requestId; }
}

const inFlightGets = new Map();
const inFlightWrites = new Map();

export function apiRequest(endpoint, requestOptions = {}) {
  const method = String(requestOptions.method || 'GET').toUpperCase();
  let body;
  try { body = requestOptions.body ? JSON.parse(requestOptions.body) : null; } catch { body = null; }
  const requestKey = body?.requestKey;
  if (method !== 'GET' && requestKey) {
    const key = `${apiUrl(endpoint)}|${requestKey}`;
    if (inFlightWrites.has(key)) return inFlightWrites.get(key);
    const request = apiRequestNow(endpoint, requestOptions).finally(() => inFlightWrites.delete(key));
    inFlightWrites.set(key, request);
    return request;
  }
  // A component owns its AbortSignal. Sharing that promise would let one unmount
  // cancel another caller (including React Strict Mode's replacement effect).
  if (method !== 'GET' || requestOptions.signal || requestOptions.dedupe === false) {
    const { dedupe: _dedupe, ...options } = requestOptions;
    return apiRequestNow(endpoint, options);
  }
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
    if (!response.ok) { const error = new ApiError(data?.message || 'The request could not be completed.', response.status, correlationId); error.retryAfter = Number(response.headers.get('Retry-After')) || 0; error.requiresProfile = Boolean(data?.requiresProfile); error.code = data?.code; error.conflicts = data?.conflicts; throw error; }
    if (!data || data.success === false) throw new ApiError('The server returned an unexpected response.', response.status, correlationId);
    return data;
  } catch (error) {
    if (signal?.aborted) throw error;
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
  const endpoint = `products?${search}`;
  return publicRequest(apiUrl(endpoint), () => apiRequest(endpoint), options);
}
export const getCategories = options => publicRequest(apiUrl('categories'), () => apiRequest('categories'), { ...options, ttl: 60000 });
export const getProduct = (slug, options) => {
  const endpoint = `products/${encodeURIComponent(slug)}`;
  return publicRequest(apiUrl(endpoint), () => apiRequest(endpoint), options);
};
export const getCart = options => apiRequest('cart', options);
export const addCartItem = (productId, variantId, quantity = 1) => apiRequest('cart/items', { method: 'POST', body: JSON.stringify({ productId, variantId, quantity }) });
export const updateCartItem = (id, quantity) => apiRequest(`cart/items/${id}`, { method: 'PATCH', body: JSON.stringify({ quantity }) });
export const removeCartItem = id => apiRequest(`cart/items/${id}`, { method: 'DELETE' });
export const authRequest = (action, data = {}) => apiRequest(`auth/${action}`, { method: 'POST', body: JSON.stringify(data) });
export const previewCheckout = delivery => apiRequest('checkout/preview', { method: 'POST', body: JSON.stringify(delivery ? { delivery } : {}) });
export const placePayLaterOrder = data => apiRequest('checkout/place', { method: 'POST', body: JSON.stringify(data), timeout: 60000 });
export const getCheckoutAttempt = key => apiRequest(`checkout/attempts/${encodeURIComponent(key)}`);
export const cancelOrder = id => apiRequest(`orders/${encodeURIComponent(id)}/cancel`, { method: 'PATCH', body: '{}' });
export const getOrder = id => apiRequest(`orders/${encodeURIComponent(id)}`);
export const getReviews = productId => apiRequest(`reviews${productId ? `?productId=${productId}` : ''}`);
