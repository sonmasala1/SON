import { describe, expect, it, vi } from 'vitest';
import { publicRequest } from './public-cache';

describe('public catalogue request cache', () => {
  it('shares a request without letting one unmount abort another subscriber', async () => {
    let resolve;
    const fetcher = vi.fn(() => new Promise(done => { resolve = done; }));
    const first = new AbortController();
    const a = publicRequest('shared-test', fetcher, { signal: first.signal });
    const rejected = expect(a).rejects.toMatchObject({ name: 'AbortError' });
    const b = publicRequest('shared-test', fetcher);
    await Promise.resolve(); first.abort(); resolve({ products: [1] });
    await rejected;
    await expect(b).resolves.toEqual({ products: [1] });
    await publicRequest('shared-test', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('expires public data and never retains a failed fetch', async () => {
    const fetcher = vi.fn().mockResolvedValue({ products: [] });
    await publicRequest('expired-test', fetcher, { ttl: 0 });
    await publicRequest('expired-test', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const failed = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(publicRequest('failure-test', failed)).rejects.toThrow('offline');
    await expect(publicRequest('failure-test', fetcher)).resolves.toEqual({ products: [] });
  });
});
