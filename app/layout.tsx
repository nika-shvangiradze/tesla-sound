import type { Metadata, Viewport } from 'next';
import './globals.css';
import './engine.css';
import './instruments.css';
import './account.css';
import './map.css';
import { AccountGate, AccountProvider } from '../components/account';
import { LanguageProvider } from '../components/language';

export const metadata: Metadata = {
  title: 'voltroar',
  description: 'სინთეზირებული ძრავის ხმები, ბრუნის ხელით მართვა და GPS რეჟიმი მანქანის ბრაუზერისთვის',
};

export const viewport: Viewport = { themeColor: '#0a1218', colorScheme: 'dark' };

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ka">
      <body><LanguageProvider><AccountProvider><AccountGate>{children}</AccountGate></AccountProvider></LanguageProvider></body>
    </html>
  );
}
