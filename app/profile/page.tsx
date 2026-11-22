import type { Metadata } from 'next';
import ProfileConsole from '../../components/profile-console';

export const metadata: Metadata = {
  title: 'პროფილი | VoltRoar',
  robots: { index: false, follow: false },
};

export default function ProfilePage() {
  return <ProfileConsole />;
}
