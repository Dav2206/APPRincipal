import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/auth-provider'; // Importar AuthProvider
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

export const metadata: Metadata = {
  title: 'Footprints Scheduler',
  description: 'Appointment scheduling for podology centers',
  robots: 'noindex, nofollow', 
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* La meta tag 'robots' ya está en el objeto metadata */}
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider> {/* Envolver con AuthProvider */}
          <AppStateProvider>
            {children}
            <Toaster />
          </AppStateProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
