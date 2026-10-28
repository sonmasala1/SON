import StaffPage from '@/components/staff/StaffPage';
import OwnerSecurity from '@/components/staff/OwnerSecurity';
export default function Security() { return <StaffPage realm="owner" permission="owner.security.manage"><OwnerSecurity /></StaffPage>; }
