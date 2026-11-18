import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VoltSound | GPS Diagnostic',
  description: 'Measure GPS timing, motion sensors and Web Audio in your vehicle browser.',
};

export const viewport: Viewport = { themeColor: '#0a1218', colorScheme: 'dark' };

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
