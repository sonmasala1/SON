'use client';
import StaffTableCell from './StaffTableCell';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStaff } from './StaffSession';
import { moneyPaise } from '@/lib/catalog';
import BusinessDashboard from './BusinessDashboard';
import ProductManagement from './ProductManagement';
import Icon from '@/components/Icon';
import AdminOrderCard from './AdminOrderCard';

function OrderManagement({ records, canUpdate, request, reload }) {
  const [drafts, setDrafts] = useState({});
  const [states, setStates] = useState({});
  useEffect(() => {
    setDrafts(current => {
      const next = { ...current };
      records.forEach(record => {
        const id = String(record._id);
        if (!next[id]) next[id] = {
          fulfillmentStatus: record.fulfillmentStatus || 'PLACED',
          paymentStatus: record.paymentStatus || 'PENDING',
          paymentConfirmed: false,
        };
      });
      return next;
    });
  }, [records]);

  function updateDraft(id, field, value) {
    setDrafts(current => ({ ...current, [id]: { ...current[id], [field]: value } }));
    setStates(current => ({ ...current, [id]: { ...current[id], success: '', error: '' } }));
  }

  async function saveOrder(record) {
    const id = String(record._id);
    const state = states[id] || {};
    if (state.saving) return;
    const draft = drafts[id];
    if (!draft) return;
    const changes = {};
    if (draft.fulfillmentStatus !== record.fulfillmentStatus) changes.fulfillmentStatus = draft.fulfillmentStatus;
    if (draft.paymentStatus !== record.paymentStatus) {
      changes.paymentStatus = draft.paymentStatus;
      if (draft.paymentStatus === 'PAID') changes.paymentConfirmed = draft.paymentConfirmed;
    }
    if (!Object.keys(changes).length) {
      setStates(current => ({ ...current, [id]: { ...current[id], success: 'No changes to save.', error: '' } }));
      return;
    }
    setStates(current => ({ ...current, [id]: { saving: true, success: '', error: '' } }));
    try {
      await request(`admin/orders/${id}`, { method: 'PATCH', body: JSON.stringify(changes) });
      setStates(current => ({ ...current, [id]: { saving: false, success: 'Saved successfully', error: '' } }));
      await reload(true);
    } catch (error) {
      setStates(current => ({ ...current, [id]: { saving: false, success: '', error: error.message } }));
    }
  }

  return <div className="staff-order-grid">{records.map(record => {
    const id = String(record._id);
    const draft = drafts[id] || { fulfillmentStatus: record.fulfillmentStatus, paymentStatus: record.paymentStatus, paymentConfirmed: false };
    return <AdminOrderCard key={id} record={record} draft={draft} state={states[id] || {}}
      canUpdate={canUpdate} onChange={(field, value) => updateDraft(id, field, value)} onSave={() => saveOrder(record)} />;
  })}</div>;
}

export default function BusinessModule({ type }) {
  const { request, account } = useStaff(); const [records, setRecords] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [stockDrafts, setStockDrafts] = useState({});
  const loadedType = useRef('');
  const load = useCallback(async (force = false) => {
    if (type === 'analytics') return;
    if (!force && loadedType.current === type) return;
    loadedType.current = type;
    try { const next = (await request(`admin/${type}`)).records; setRecords(next); if (type === 'inventory') setStockDrafts(Object.fromEntries(next.map(record => [record._id, record.stock]))); setError(''); }
    catch (error) { loadedType.current = ''; setError(error.message); }
  }, [request, type]);
  useEffect(() => { void load(); const refresh = () => { if (!document.activeElement?.closest('.staff-inline-form')) void load(true); }; window.addEventListener('focus', refresh); const timer = setInterval(refresh, 10000); return () => { clearInterval(timer); window.removeEventListener('focus', refresh); }; }, [load]);
  async function update(record, event) {
    event.preventDefault(); setBusy(true);
    const form = new FormData(event.currentTarget);
    const value = form.get('value');
    const paymentStatus = form.get('paymentStatus');
    const changes = type === 'inventory'
      ? { stock: Number(value), expectedStock: record.stock }
      : { fulfillmentStatus: value, ...(paymentStatus && paymentStatus !== record.paymentStatus ? { paymentStatus, paymentConfirmed: form.get('paymentConfirmed') === 'on' } : {}) };
    try { await request(`admin/${type}/${record._id}`, { method: 'PATCH', body: JSON.stringify(changes) }); await load(true); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  if (type === 'analytics') return <BusinessDashboard endpoint="admin/analytics" />;
  if (type === 'products') return <ProductManagement />;
  if (type === 'orders') return <><div className="staff-page-heading"><div><p className="eyebrow">ORDER MANAGEMENT</p><h1><Text>Orders</Text></h1></div><button className="button button-outline" onClick={() => load(true)} disabled={busy}><Icon name="refresh" size={18} /><Text>Refresh</Text></button></div><Text error>{error && <p role="alert" className="form-error"><Text error>{error}</Text></p>}</Text>{!records ? <p role="status"><Text>Loading authorized records…</Text></p> : !records.length ? <p className="staff-empty"><Text>No orders are available.</Text></p> : <OrderManagement records={records} canUpdate={account.permissions.includes('orders.update')} request={request} reload={load} />}</>;
  return (
    <>
      <div className="staff-page-heading">
        <h1><Text>{type.charAt(0).toUpperCase() + type.slice(1)}</Text></h1>
        <button className="text-link" onClick={() => load(true)}><Text>Refresh</Text></button>
      </div>
      {error && <p role="alert" className="form-error"><Text>{error}</Text></p>}
      {!records ? (
        <p role="status"><Text>Loading authorized records…</Text></p>
      ) : !records.length ? (
        <p className="staff-empty"><Text>No records are available.</Text></p>
      ) : (
        <div className="staff-table-scroll">
          <table role="table" className="staff-table">
            <thead role="rowgroup">
              <tr role="row">
                <th scope="col"><Text>Record</Text></th>
                <th scope="col"><Text>Details</Text></th>
                <th scope="col"><Text>Status / amount</Text></th>
                {['inventory', 'orders'].includes(type) && account.permissions.includes(`${type}.update`) && (
                  <th scope="col"><Text>Update</Text></th>
                )}
              </tr>
            </thead>
            <tbody role="rowgroup">
              {records.map(record => (
                <tr role="row" key={record._id}>
                  <StaffTableCell label="Record"><strong><Text>{record.publicId || record.name || record.productId?.name || record.sku || record._id}</Text></strong></StaffTableCell>
                  <StaffTableCell label="Details">
                    <Text>{record.email || record.delivery?.email || record.label || record.category || record.paymentMode || ''}</Text>
                    {(record.phone || record.delivery?.phone) && <div><Text>{record.phone || record.delivery?.phone}</Text></div>}
                    {record.delivery?.fullName && <div><strong><Text>{record.delivery.fullName}</Text></strong></div>}
                    {record.delivery?.address && <div><Text>{`${record.delivery.address}, ${record.delivery.city || ''} ${record.delivery.pincode || ''}`}</Text></div>}
                    {record.items?.length ? record.items.map(item => (
                      <div key={String(item.variantId || item.productId || item.name)}><Text>{item.name}</Text><Text>{` × ${item.quantity}`}</Text></div>
                    )) : null}
                  </StaffTableCell>
                  <StaffTableCell label="Status / amount"><Text>{type === 'inventory' ? `${record.stock} available` : `${record.totals?.totalPaise != null ? moneyPaise(record.totals.totalPaise) : record.amountPaise != null ? moneyPaise(record.amountPaise) : '—'} · Payment: ${record.paymentStatus || '—'} · Order: ${record.fulfillmentStatus || record.status || '—'}`}</Text></StaffTableCell>
                  {['inventory', 'orders'].includes(type) && account.permissions.includes(`${type}.update`) && (
                    <StaffTableCell label="Update">
                      <form className="staff-inline-form" key={`${record._id}:${record.paymentStatus}:${record.fulfillmentStatus}`} onSubmit={event => update(record, event)}>
                        {type === 'inventory' ? (
                          <LocalizedAttrs>
                            <>
                              <button type="button" className="button button-small" aria-label={`Decrease stock for ${record.sku}`} onClick={() => setStockDrafts(drafts => ({ ...drafts, [record._id]: Math.max(0, Number(drafts[record._id] ?? record.stock) - 1) }))}>−</button>
                              <input type="number" name="value" aria-label={`Stock for ${record.sku}`} value={stockDrafts[record._id] ?? record.stock} onChange={event => setStockDrafts(drafts => ({ ...drafts, [record._id]: Math.max(0, Number(event.target.value || 0)) }))} min={0} max={10000000} required />
                              <button type="button" className="button button-small" aria-label={`Increase stock for ${record.sku}`} onClick={() => setStockDrafts(drafts => ({ ...drafts, [record._id]: Math.min(10000000, Number(drafts[record._id] ?? record.stock) + 1) }))}>+</button>
                            </>
                          </LocalizedAttrs>
                        ) : (
                          <LocalizedAttrs>
                            <>
                              <select name="value" defaultValue={record.fulfillmentStatus || 'PLACED'} aria-label={`Fulfillment for ${record.publicId}`}>
                                {['PLACED', 'CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map(status => <option value={status} key={status}><Text>{status}</Text></option>)}
                              </select>
                              {type === 'orders' && (
                                <select name="paymentStatus" defaultValue={record.paymentStatus || 'PENDING'} aria-label={`Payment for ${record.publicId}`}>
                                  {['PENDING', 'PAID', 'CANCELLED'].map(status => <option value={status} key={status}><Text>{status}</Text></option>)}
                                </select>
                              )}
                              {type === 'orders' && record.paymentStatus === 'PENDING' && (
                                <label><input type="checkbox" name="paymentConfirmed" /><Text>Payment received and verified</Text></label>
                              )}
                            </>
                          </LocalizedAttrs>
                        )}
                        <button className="button button-small" disabled={busy}><Text>Save</Text></button>
                      </form>
                    </StaffTableCell>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
