import ReviewModeration from '@/components/ReviewModeration';
import StaffPage from '@/components/staff/StaffPage';
export default function AdminReviews() { return <StaffPage permission="reviews.view"><ReviewModeration /></StaffPage>; }
