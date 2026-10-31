import StaffPage from '@/components/staff/StaffPage';
import BusinessDashboard from '@/components/staff/BusinessDashboard';

export default function OwnerDashboard() {
  return <StaffPage realm="owner" permission="dashboard.view"><BusinessDashboard /></StaffPage>;
}
