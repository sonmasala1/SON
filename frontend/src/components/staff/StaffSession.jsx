'use client';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiRequest } from '@/lib/api';

const Context = createContext(null);
export const useStaff = () => useContext(Context);
export default function StaffSession({ realm = 'admin', permission, children }) {
  const [session, setSession] = useState(null), [error, setError] = useState('');
  const router = useRouter();
  const refresh = useCallback(async () => {
    try { const result = await apiRequest(`${realm}/auth/me`); setSession(result); setError(''); }
    catch (error) { setSession(null); if (error.status === 401) router.replace(`/${realm}/login`); else setError(error.status === 403 ? 'Your account is not authorized to access this area.' : error.message); }
  }, [realm, router]);
  useEffect(() => { void refresh(); const timer = setInterval(refresh, 60000); const focus = () => void refresh(); window.addEventListener('focus', focus); return () => { clearInterval(timer); window.removeEventListener('focus', focus); }; }, [refresh]);
  const request = useCallback(async (path, options = {}) => {
    try { return await apiRequest(path, { ...options, headers: { ...options.headers, 'X-CSRF-Token': session?.csrfToken || '' } }); }
    catch (error) { if (error.status === 401) { setSession(null); router.replace(`/${realm}/login`); } throw error; }
  }, [session, realm, router]);
  if (error) return <main id="main" className="wrap page-content"><div className="catalog-state" role="alert"><h1><Text>{"Access denied"}</Text></h1><p><Text error>{error}</Text></p><Link className="button" href={`/${realm}/login`}><Text>{"Go to "}</Text><Text>{realm === 'owner' ? 'owner' : 'admin'}</Text><Text>{" sign-in"}</Text></Link></div></main>;
  if (!session) return <main id="main" className="wrap page-content" role="status"><Text>{"Checking secure staff access…"}</Text></main>;
  if (permission && !session.account.permissions.includes(permission)) return <main id="main" className="wrap page-content"><div className="catalog-state"><h1><Text>{"Permission required"}</Text></h1><p><Text>{"Your account does not have access to this module."}</Text></p><Link href={`/${realm}/dashboard`} className="button"><Text>{"Back to dashboard"}</Text></Link></div></main>;
  return <Context.Provider value={{ ...session, realm, request, refresh }}><Text>{children}</Text></Context.Provider>;
}
