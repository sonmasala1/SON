import StaffPage from '@/components/staff/StaffPage';
import InviteAdmin from '@/components/staff/InviteAdmin';
export default function NewAdmin() { return <StaffPage realm="owner" permission="owner.staff.manage"><InviteAdmin /></StaffPage>; }
