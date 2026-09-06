import type { Metadata } from 'next';
import { Outfit, Source_Sans_3 } from 'next/font/google';
import { QueryProvider } from '@/context';
import { SiteHeader } from '@/components/layout/site-header';
import { cn } from '@/lib/utils';
import './globals.css';

const heading = Outfit({
  subsets: ['latin'],
  variable: '--font-heading',
});

const sans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Rodoviária — passagens de ônibus',
  description: 'Busque e reserve passagens rodoviárias',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={cn(heading.variable, sans.variable)}>
      <body className="font-sans">
        <QueryProvider>
          <SiteHeader />
          <main>{children}</main>
        </QueryProvider>
      </body>
    </html>
  );
}
