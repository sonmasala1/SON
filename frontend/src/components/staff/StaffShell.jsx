'use client';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useStaff } from './StaffSession';
import Icon from '@/components/Icon';

export default function StaffShell({ children }) {
  const { account, realm, logout: endSession } = useStaff(); const pathname = usePathname(); const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const links = realm === 'owner' ? [
    ['Dashboard', '/owner/dashboard', 'dashboard.view', 'dashboard'],
  ] : [
    ['Dashboard', `/${realm}/dashboard`, 'dashboard.view', 'dashboard'], ['Orders', '/admin/modules/orders', 'orders.view', 'bag'],
    ['Products', '/admin/modules/products', 'products.view', 'package'], ['Inventory', '/admin/modules/inventory', 'inventory.view', 'inventory'],
    ['Customers', '/admin/modules/customers', 'customers.view', 'users'], ['Payments', '/admin/modules/payments', 'payments.view', 'credit'],
    ['Analytics', '/admin/modules/analytics', 'analytics.view', 'chart'], ['Shipping', '/admin/modules/shipping', 'shipping.view', 'truck'],
    ['Review moderation', '/admin/reviews', 'reviews.view', 'reviews'],
  ];
  async function logout() { if (busy) return; setBusy(true); try { await endSession(); } catch (error) { setError(error.message); } finally { setBusy(false); } }
  return <main id="main" className="staff-workspace"><aside className="staff-sidebar"><div className="staff-sidebar-title"><Icon name="sun" size={28} /><div><strong><Text>{"SON MASALA"}</Text></strong><small><Text>{"ADMINISTRATION"}</Text></small></div></div><div className="staff-profile"><strong>{account.fullName}</strong><span><Text>{account.adminId}</Text></span><small><Text>{account.role.replaceAll('_', ' ')}</Text></small></div><LocalizedAttrs><nav aria-label="Administration navigation"><Text>{links.filter(([, , permission]) => account.permissions.includes(permission)).map(([name, href, , icon]) => <Link key={href} href={href} className={pathname === href ? 'selected' : ''}><Icon name={icon} size={20} /><span><Text>{name}</Text></span></Link>)}</Text></nav></LocalizedAttrs><button className="button button-outline staff-logout" onClick={logout}><Text>{"Sign out of admin"}</Text></button><Text error>{error && <p role="alert"><Text error>{error}</Text></p>}</Text></aside><section className="staff-content"><Text>{children}</Text></section></main>;
}
