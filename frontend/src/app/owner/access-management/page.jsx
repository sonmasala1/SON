import StaffPage from '@/components/staff/StaffPage';
import AccessManagement from '@/components/staff/AccessManagement';
export default function OwnerAccessManagement() { return <StaffPage realm="owner" permission="owner.staff.manage"><AccessManagement /></StaffPage>; }
