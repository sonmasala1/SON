'use client';
import { useLocale } from '@/components/LocaleProvider';

// The visible mobile label follows the same translation as its column heading.
// Native table headers remain available to assistive technology at every size.
export default function StaffTableCell({ label, children, ...props }) {
  const { t } = useLocale();
  return <td role="cell" data-label={t(label)} {...props}>{children}</td>;
}
