import StaffPage from '@/components/staff/StaffPage';
import AuditHistory from '@/components/staff/AuditHistory';
export default function OwnerAuditHistory({ searchParams }) { return <StaffPage realm="owner" permission="owner.access"><AuditHistory targetId={typeof searchParams.targetId === 'string' ? searchParams.targetId.slice(0, 80) : ''} /></StaffPage>; }
