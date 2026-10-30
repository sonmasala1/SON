'use client';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useStaff } from './StaffSession';
import Icon from '@/components/Icon';

export default function StaffShell({ children }) {
  const { account, realm, request } = useStaff(); const pathname = usePathname(), router = useRouter(); const [error, setError] = useState('');
  const links = [['Dashboard', `/${realm}/dashboard`, 'dashboard.view'], ['Orders', '/admin/modules/orders', 'orders.view'], ['Products', '/admin/modules/products', 'products.view'], ['Inventory', '/admin/modules/inventory', 'inventory.view'], ['Customers', '/admin/modules/customers', 'customers.view'], ['Payments', '/admin/modules/payments', 'payments.view'], ['Analytics', '/admin/modules/analytics', 'analytics.view'], ['Shipping', '/admin/modules/shipping', 'shipping.view'], ['Review moderation', '/admin/reviews', 'reviews.view']];
  async function logout() { try { await request(`${realm}/auth/logout`, { method: 'POST' }); router.replace(`/${realm}/login`); } catch (error) { setError(error.message); } }
  return <main id="main" className="staff-workspace"><aside className="staff-sidebar"><div className="staff-sidebar-title"><Icon name="sun" size={28} /><div><strong><Text>{"SON MASALA"}</Text></strong><small><Text>{"ADMINISTRATION"}</Text></small></div></div><div className="staff-profile"><strong>{account.fullName}</strong><span><Text>{account.adminId}</Text></span><small><Text>{account.role.replaceAll('_', ' ')}</Text></small></div><LocalizedAttrs><nav aria-label="Administration navigation"><Text>{links.filter(([, , permission]) => account.permissions.includes(permission)).map(([name, href]) => <Link key={href} href={href} className={pathname === href ? 'selected' : ''}><Text>{name}</Text><Icon size={24} /></Link>)}</Text></nav></LocalizedAttrs><button className="button button-outline staff-logout" onClick={logout}><Text>{"Sign out of admin"}</Text></button><Text error>{error && <p role="alert"><Text error>{error}</Text></p>}</Text></aside><section className="staff-content"><Text>{children}</Text></section></main>;
}
