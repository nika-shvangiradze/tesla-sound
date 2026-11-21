import type { Metadata } from 'next';
import { AccountForm } from '../../components/account';

export const metadata: Metadata = { title: 'ადმინისტრატორის ანგარიშის შექმნა | VoltRoar', robots: { index: false, follow: false } };
export default function Page() { return <AccountForm setup />; }
