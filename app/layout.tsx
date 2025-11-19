import type { Metadata } from 'next';
import { Inter, Poppins, Playfair_Display } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
});

const poppins = Poppins({ 
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-poppins',
});

const playfair = Playfair_Display({ 
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['italic'],
  variable: '--font-playfair',
});

export const metadata: Metadata = {
  title: 'Inspired Outfitting - AI Fashion Try-On',
  description: 'See yourself in every style with AI-powered virtual try-on',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${poppins.variable} ${playfair.variable} bg-warm-cream text-charcoal-grey font-sans min-h-screen flex flex-col`}>
        <AuthProvider>
          <Header />
          <main className="flex-grow">
            {children}
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}

