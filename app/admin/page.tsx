import type { Metadata } from 'next';
import AdminConsole from '../../components/admin-console';

export const metadata: Metadata = { title: 'Admin | VoltRoar', robots: { index: false, follow: false } };
export default function Page() { return <AdminConsole />; }
