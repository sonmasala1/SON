import StaffPage from '@/components/staff/StaffPage';
import BusinessDashboard from '@/components/staff/BusinessDashboard';
export default function Dashboard() { return <StaffPage permission="dashboard.view"><BusinessDashboard /></StaffPage>; }
