import './globals.css';
import { AuthProvider } from '../context/AuthContext';
import { Inter } from 'next/font/google';
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import Providers from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'KingGold Dashboard',
  description: 'Gold Inventory Management System',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={cn("font-sans", inter.variable)}>
      <body>
        <Providers>
          <AuthProvider>
            <TooltipProvider>
              {children}
              <Toaster position="top-right" richColors />
            </TooltipProvider>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
