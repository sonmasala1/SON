// Only public catalogue data belongs here. Never cache identity, cart, orders or staff responses.
const entries = new Map();
const pending = new Map();
const MAX_ENTRIES = 48;

function subscribe(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}
export function publicRequest(key, fetcher, { signal, ttl = 10000, refresh = false } = {}) {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  const cached = entries.get(key);
  if (!refresh && cached && cached.expires > Date.now()) return Promise.resolve(cached.value);
  if (!pending.has(key)) {
    const request = Promise.resolve().then(fetcher).then(value => {
      entries.delete(key);
      entries.set(key, { value, expires: Date.now() + ttl });
      while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
      return value;
    }).finally(() => pending.delete(key));
    // An aborted subscriber does not cancel another component's request.
    request.catch(() => {});
    pending.set(key, request);
  }
  return subscribe(pending.get(key), signal);
}
