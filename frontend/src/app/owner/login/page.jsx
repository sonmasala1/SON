import StaffLogin from '@/components/staff/StaffLogin';

export const metadata = { title: 'Owner Sign-in | SON MASALA', robots: { index: false, follow: false } };

export default function OwnerLogin() {
  return <StaffLogin realm="owner" />;
}
