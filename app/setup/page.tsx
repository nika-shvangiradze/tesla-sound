import type { Metadata } from 'next';
import { AccountForm } from '../../components/account';

export const metadata: Metadata = { title: 'Administrator setup | VoltRoar', robots: { index: false, follow: false } };
export default function Page() { return <AccountForm setup />; }
