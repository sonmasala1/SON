import { describe, expect, it } from 'vitest';
import configuration from '../../config/api-base';
const { resolveApiBaseUrl } = configuration;

describe('environment API routing', () => {
  it('defaults development to the local Express API and rejects a remote backend', () => {
    expect(resolveApiBaseUrl({ nodeEnv: 'development' })).toBe('http://localhost:5000/api/v1');
    expect(() => resolveApiBaseUrl({ nodeEnv: 'development', configuredUrl: 'https://son-5wk9.onrender.com/api/v1' })).toThrow('local backend');
  });
  it('uses the consolidated production fallback and rejects loopback addresses', () => {
    expect(() => resolveApiBaseUrl({ nodeEnv: 'production' })).toThrow('Vercel');
    for (const host of ['localhost', '127.0.0.1', '[::1]']) expect(resolveApiBaseUrl({ nodeEnv: 'production', configuredUrl: `https://${host}:5000/api/v1`, productionUrl: 'https://son-5wk9.onrender.com/api/v1' })).toBe('https://son-5wk9.onrender.com/api/v1');
    expect(resolveApiBaseUrl({ nodeEnv: 'production', configuredUrl: 'https://son-5wk9.onrender.com/api/v1/' })).toBe('https://son-5wk9.onrender.com/api/v1');
  });
  it('rejects credentials and malformed API paths', () => {
    for (const configuredUrl of ['http://user:secret@localhost:5000/api/v1', 'http://localhost:5000', 'http://localhost:5000/api/v1?token=secret']) expect(() => resolveApiBaseUrl({ nodeEnv: 'development', configuredUrl })).toThrow('without credentials');
  });
});
