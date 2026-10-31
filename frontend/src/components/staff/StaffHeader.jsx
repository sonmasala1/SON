'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { Brand } from '@/components/Header';
import Icon from '@/components/Icon';
import { useStaff } from './StaffSession';

export default function StaffHeader() {
  const { account, realm, session, logout } = useStaff();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [profile, setProfile] = useState(false);
  const dropdown = useRef(null), trigger = useRef(null);
  async function signOut() {
    if (busy) return;
    setBusy(true); setError('');
    try { await logout(); } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  function close(event) {
    if (event.key === 'Escape') { dropdown.current.open = false; trigger.current.focus(); }
  }
  return <header className="staff-header"><div className="wrap staff-header-inner"><Brand /><span className="staff-header-label">Administration</span>{account ? <details className="staff-identity" ref={dropdown} onKeyDown={close} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) dropdown.current.open = false; }}><summary ref={trigger} aria-label={`${realm === 'owner' ? 'Owner' : 'Admin'} profile: ${account.fullName || account.adminId}`}><span className="staff-avatar"><Icon name="profile" size={24} /></span><span className="staff-identity-text"><strong translate="no">{account.fullName || account.adminId}</strong><small>{account.role.replaceAll('_', ' ')} · {account.adminId}</small></span><span aria-hidden="true">▾</span></summary><div className="staff-profile-menu"><button type="button" aria-expanded={profile} aria-controls="staff-header-profile" onClick={() => setProfile(value => !value)}>Admin Profile</button>{profile && <div id="staff-header-profile" className="staff-profile-details"><strong translate="no">{account.fullName || account.adminId}</strong><span>{account.adminId}</span><span>{account.email}</span><span>{account.role.replaceAll('_', ' ')}</span><small>Session expires: {new Date(session.expiresAt).toLocaleString()}</small></div>}<button type="button" onClick={signOut} disabled={busy}>{busy ? 'Signing out…' : 'Sign Out of Admin'}</button>{error && <p role="alert">{error}</p>}</div></details> : <Link href={`/${realm}/login`} className="text-link">Admin sign-in</Link>}</div></header>;
}
