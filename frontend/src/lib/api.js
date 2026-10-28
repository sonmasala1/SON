export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, status = 0) { super(message); this.name = 'ApiError'; this.status = status; }
}

export async function apiRequest(endpoint, { timeout = 10000, signal, ...options } = {}) {
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
    const path = endpoint.replace(/^\/+/, '').replace(/^api\/v1\/?/, '');
    url = `${API_BASE_URL}/${path}`;
    const response = await fetch(url, { ...options, credentials: 'include', headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }, signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) { const error = new ApiError(`HTTP ${response.status}: ${data?.message || 'The request could not be completed.'}`, response.status); error.retryAfter = Number(response.headers.get('Retry-After')) || 0; throw error; }
    if (!data || data.success === false) throw new ApiError('The server returned an unexpected response.', response.status);
    return data;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof ApiError) throw error;
    if (process.env.NODE_ENV === 'development') console.warn('[SON MASALA API]', url || API_BASE_URL, timedOut ? 'timeout' : 'network request failed');
    throw new ApiError(timedOut ? 'The request took too long. Please try again.' : 'We couldn’t reach the store. Please check your connection and try again.');
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
export const demoPayment = data => apiRequest('demo-payments', { method: 'POST', body: JSON.stringify(data), timeout: 20000 });
export const getOrder = id => apiRequest(`orders/${encodeURIComponent(id)}`);
export const getReviews = productId => apiRequest(`reviews${productId ? `?productId=${productId}` : ''}`);
