import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';

export const metadata: Metadata = {
  title: 'Morning Oracle - AI Voice Assistant & Smart Alarm',
  description: 'Capture daily ideas by voice and wake up to a personalized morning AI audio broadcast.',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: 'dark', backgroundColor: '#0a0a0a' }}>
      <body className="bg-[#0a0a0a] text-gray-100 min-h-screen antialiased selection:bg-oracle-cyan selection:text-oracle-dark">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
