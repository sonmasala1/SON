import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, getProducts } from './api';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('shared API client', () => {
  it('sends a request ID and preserves the backend correlation ID on errors', async () => {
    const requestId = crypto.randomUUID();
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Please try again' }), { status: 401, headers: { 'X-Request-ID': requestId } }));
    vi.stubGlobal('fetch', fetch);
    await expect(apiRequest('auth/me')).rejects.toMatchObject({ status: 401, requestId });
    expect(fetch.mock.calls[0][1].headers['X-Request-ID']).toMatch(/^[a-f0-9-]{36}$/);
  });
  it('uses the same-origin browser proxy when enabled', async () => {
    vi.stubGlobal('window', {});
    vi.stubEnv('NEXT_PUBLIC_API_PROXY', 'true');
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true })));
    vi.stubGlobal('fetch', fetch);
    await apiRequest('cart');
    expect(fetch.mock.calls[0][0]).toBe('/api/v1/cart');
    expect(fetch.mock.calls[0][1].credentials).toBe('include');
  });
  it('preserves profile-completion and cooldown information from real HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, requiresProfile: true, message: 'Complete registration.' }), { status: 422, headers: { 'Retry-After': '60' } })));
    await expect(apiRequest('auth/email/verify-otp')).rejects.toMatchObject({ status: 422, requiresProfile: true, retryAfter: 60 });
  });
  it('uses a single API prefix and includes credentials', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await apiRequest('/api/v1/health');
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:5000/api/v1/health');
    expect(fetch.mock.calls[0][1].credentials).toBe('include');
  });
  it('preserves HTTP errors for useful status reporting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Catalogue unavailable' }), { status: 503 })));
    await expect(apiRequest('products')).rejects.toMatchObject({ status: 503, message: 'HTTP 503: Catalogue unavailable' });
  });
  it('reports network failures without raw browser exception text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiRequest('health')).rejects.toThrow('We couldn’t reach the store');
  });
  it('aborts a hanging request and reports timeout', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))))));
    await expect(apiRequest('health', { timeout: 10 })).rejects.toThrow('request took too long');
  });
  it('rejects non-JSON success responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Proxy error</html>')));
    await expect(apiRequest('health')).rejects.toThrow('unexpected response');
  });
  it('encodes search filters safely', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, products: [] })));
    vi.stubGlobal('fetch', fetch);
    await getProducts({ q: 'chilli & salt', category: 'ground-spices' });
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.searchParams.get('q')).toBe('chilli & salt');
    expect(url.searchParams.get('category')).toBe('ground-spices');
  });
});
