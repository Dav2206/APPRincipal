import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/auth-provider';
import { AppStateProvider } from '@/contexts/app-state-provider';
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata = {
  title: 'Footprints Scheduler',
  description: 'Appointment scheduling for podology centers',
  robots: 'noindex, nofollow',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <AuthProvider>
          <AppStateProvider>
            {children}
          </AppStateProvider>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
