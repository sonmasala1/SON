'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiRequest, ApiError } from '@/lib/api';
import StaffHeader from './StaffHeader';

const Context = createContext(null);
export const useStaff = () => useContext(Context);

export default function StaffSession({ realm = 'admin', permission, children }) {
  const [session, setSession] = useState(null), [error, setError] = useState(''), [checking, setChecking] = useState(true);
  const current = useRef(null), pending = useRef(null), mounted = useRef(false);
  const generation = useRef(0);
  const router = useRouter();
  const clearSession = useCallback(() => { generation.current++; current.current = null; setSession(null); }, []);
  const refresh = useCallback(() => {
    if (pending.current) return pending.current;
    setChecking(true);
    const started = generation.current;
    const operation = (async () => {
      try {
        const result = await apiRequest(`${realm}/auth/me`, { cache: 'no-store' });
        if (!result.account || !Array.isArray(result.account.permissions) || !result.csrfToken) throw new ApiError('The server returned an invalid staff session. Please sign in again.');
        if (!mounted.current || started !== generation.current) return;
        current.current = result; setSession(result); setError('');
      } catch (failure) {
        if (!mounted.current || started !== generation.current) return;
        clearSession(); setError(failure.message);
        if (failure.status === 401) router.replace(`/${realm}/login`);
      } finally {
        if (mounted.current) setChecking(false);
      }
    })().finally(() => { if (pending.current === operation) pending.current = null; });
    pending.current = operation;
    return operation;
  }, [realm, router, clearSession]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; };
  }, [refresh]);

  // Revalidate only established sessions. A failed check waits for an explicit retry.
  const authenticated = Boolean(session);
  useEffect(() => {
    if (!authenticated) return;
    const timer = setInterval(() => void refresh(), 60000);
    return () => clearInterval(timer);
  }, [authenticated, refresh]);

  // Read the current CSRF token without changing request identity on auth refresh.
  const request = useCallback(async (path, options = {}) => {
    if (!current.current) throw new ApiError('Please sign in with an authorized staff account.', 401);
    try {
      return await apiRequest(path, { ...options, headers: { ...options.headers, 'X-CSRF-Token': current.current.csrfToken } });
    } catch (failure) {
      if (failure.status === 401 && mounted.current) { clearSession(); setError('Your staff session has expired. Please sign in again.'); router.replace(`/${realm}/login`); }
      throw failure;
    }
  }, [realm, router, clearSession]);
  const logout = useCallback(async () => {
    await request(`${realm}/auth/logout`, { method: 'POST' });
    clearSession();
    router.replace(`/${realm}/login`);
  }, [realm, request, router, clearSession]);

  let content = children;
  if (error) content = <main id="main" className="wrap page-content"><div className="catalog-state" role="alert"><h1>Access denied</h1><p>{error}</p><button className="button" onClick={() => void refresh()} disabled={checking}>{checking ? 'Checking access…' : 'Retry'}</button> <Link className="text-link" href={`/${realm}/login`}>Go to {realm} sign-in</Link></div></main>;
  else if (!session) content = <main id="main" className="wrap page-content" role="status">Checking secure staff access…</main>;
  else if (permission && !session.account.permissions.includes(permission)) content = <main id="main" className="wrap page-content"><div className="catalog-state"><h1>Permission required</h1><p>Your account does not have access to this module.</p><Link href={`/${realm}/dashboard`} className="button">Back to dashboard</Link></div></main>;
  return <Context.Provider value={{ ...session, realm, request, refresh, logout }}><StaffHeader />{content}</Context.Provider>;
}
