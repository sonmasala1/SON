import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import StaffSession from './StaffSession';
import StaffShell from './StaffShell';
export default function StaffPage({ realm = 'admin', permission, children }) { return <StaffSession realm={realm} permission={permission}><StaffShell><Text>{children}</Text></StaffShell></StaffSession>; }
