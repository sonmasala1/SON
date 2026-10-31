'use client';
import StaffTableCell from './StaffTableCell';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStaff } from './StaffSession';
import { moneyPaise } from '@/lib/catalog';

export default function BusinessDashboard({ endpoint }) {
  const { realm, request, account } = useStaff(); const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const pending = useRef(null), mounted = useRef(false);
  const load = useCallback(() => {
    if (pending.current) return pending.current;
    setLoading(true);
    const operation = (async () => {
      try {
        const result = await request(endpoint || `${realm}/dashboard`, { timeout: 15000, cache: 'no-store' });
        if (!result.modules || typeof result.modules !== 'object') throw new Error('Business metrics were unavailable. Please retry.');
        if (mounted.current) { setData(result); setError(''); }
      } catch (error) {
        if (mounted.current) setError(error.message);
      } finally {
        if (mounted.current) setLoading(false);
      }
    })().finally(() => { if (pending.current === operation) pending.current = null; });
    pending.current = operation;
    return operation;
  }, [realm, request, endpoint]);
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [load]);
  const modules = data?.modules;
  const cards = modules ? [
    ...(modules.orders ? [['Total Orders', modules.orders.total], ['Pending Orders', modules.orders.pending], ['Pending Payments', modules.orders.pending]] : []),
    ...(modules.payments ? [['Revenue Collected', moneyPaise(modules.payments.collectedPaise)], ['Refunds', moneyPaise(modules.payments.refundedPaise)], ['Net Collected', moneyPaise(modules.payments.netCollectedPaise)]] : []),
    ...(modules.analytics ? [['Products sold', modules.analytics.unitsSold]] : []),
    ...(modules.inventory ? [['Available Inventory Units', modules.inventory.availableUnits], ['Low Stock Products', modules.inventory.lowStock]] : []),
    ...(modules.products ? [['Total Products', modules.products.published]] : []), ...(modules.customers ? [['Customer Accounts', modules.customers.total]] : []),
  ] : [];
  return <><div className="staff-page-heading"><div><p className="eyebrow"><Text>{account.role === 'OWNER' ? 'THE COMPLETE BUSINESS VIEW' : 'YOUR AUTHORIZED BUSINESS VIEW'}</Text></p><h1><Text>{"Business dashboard"}</Text></h1></div><button className="text-link" onClick={load} disabled={loading}><Text>{loading ? "Refreshing data…" : error ? "Retry" : "Refresh data"}</Text></button></div><p className="staff-notice"><Text>{"Sales totals include confirmed payments."}</Text></p><Text error>{error && <p className="form-error" role="alert"><Text error>{error}</Text></p>}</Text><Text>{loading ? <p role="status"><Text>{"Loading authorized business data…"}</Text></p> : !data ? null : <><div className="staff-metric-grid"><Text>{cards.map(([label, value]) => <article key={label}><span><Text>{label}</Text></span><strong><Text>{value}</Text></strong></article>)}</Text></div><Text>{modules.analytics && <div className="staff-chart-grid"><section><h2><Text>{"Product-wise units sold"}</Text></h2><Text>{modules.analytics.productSales.length ? <table role="table" className="staff-table"><thead role="rowgroup"><tr role="row"><th scope="col"><Text>{"Product"}</Text></th><th scope="col"><Text>{"Units"}</Text></th><th scope="col"><Text>{"Sales"}</Text></th></tr></thead>  <tbody role="rowgroup">{modules.analytics.productSales.map(row => <tr role="row" key={row._id}><StaffTableCell label="Product"><Text>{row.name}</Text></StaffTableCell><StaffTableCell label="Units"><Text>{row.units}</Text></StaffTableCell><StaffTableCell label="Sales"><Text>{moneyPaise(row.revenuePaise)}</Text></StaffTableCell></tr>)}</tbody></table> : <p><Text>{"No actual paid product sales yet."}</Text></p>}</Text></section><section><h2><Text>{"Category-wise sales"}</Text></h2><Text>{modules.analytics.categorySales.length ? <table role="table" className="staff-table"><thead role="rowgroup"><tr role="row"><th scope="col"><Text>{"Category"}</Text></th><th scope="col"><Text>{"Units"}</Text></th><th scope="col"><Text>{"Sales"}</Text></th></tr></thead>  <tbody role="rowgroup">{modules.analytics.categorySales.map(row => <tr role="row" key={row.category}><StaffTableCell label="Category"><Text>{row.category}</Text></StaffTableCell><StaffTableCell label="Units"><Text>{row.units}</Text></StaffTableCell><StaffTableCell label="Sales"><Text>{moneyPaise(row.revenuePaise)}</Text></StaffTableCell></tr>)}</tbody></table> : <p><Text>{"No actual paid category sales yet."}</Text></p>}</Text></section></div>}</Text></>}</Text></>;
}
