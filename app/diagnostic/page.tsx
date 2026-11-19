import type { Metadata } from 'next';
import Dashboard from '../../components/dashboard';

export const metadata: Metadata = {
  title: 'VoltSound | GPS Diagnostic',
  description: 'Measure GPS timing, motion sensors and Web Audio in your vehicle browser.',
};

export default function DiagnosticPage() {
  return <Dashboard />;
}
