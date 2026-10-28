import { notFound } from 'next/navigation';
import StaffPage from '@/components/staff/StaffPage';
import BusinessModule from '@/components/staff/BusinessModule';
export default function ModulePage({ params }) { const allowed = ['orders', 'products', 'inventory', 'customers', 'payments', 'analytics', 'shipping']; if (!allowed.includes(params.type)) notFound(); return <StaffPage permission={`${params.type}.view`}><BusinessModule type={params.type} /></StaffPage>; }
