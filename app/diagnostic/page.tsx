import type { Metadata } from 'next';
import Dashboard from '../../components/dashboard';

export const metadata: Metadata = {
  title: 'GPS დიაგნოსტიკა | VoltSound',
  description: 'შეამოწმე GPS, მოძრაობის სენსორები და Web Audio მანქანის ბრაუზერში',
};

export default function DiagnosticPage() {
  return <Dashboard />;
}
