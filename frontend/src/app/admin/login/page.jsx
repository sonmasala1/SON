import StaffLogin from '@/components/staff/StaffLogin';
export const metadata = { title: 'Admin Sign-in | SON MASALA', robots: { index: false, follow: false } };
export default function AdminLogin() { return <StaffLogin realm="admin" />; }
