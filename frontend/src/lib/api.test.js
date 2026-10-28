import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, getProducts } from './api';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('shared API client', () => {
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
