import type { Metadata, Viewport } from 'next';
import './globals.css';
import './engine.css';

export const metadata: Metadata = {
  title: 'VoltSound | V8 GPS Edition',
  description: 'Synthesized engine sounds with manual RPM and GPS drive for your vehicle browser.',
};

export const viewport: Viewport = { themeColor: '#0a1218', colorScheme: 'dark' };

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
