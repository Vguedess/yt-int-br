import type { Metadata } from 'next';
import { SiteTabs } from '@/app/components/SiteTabs';
import './globals.css';

export const metadata: Metadata = {
  title: 'YouTube Intelligence BR',
  description: 'Decisor de vídeos para YouTube Brasil baseado em sinais, restrições e dinâmica de atenção.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <SiteTabs />
        {children}
      </body>
    </html>
  );
}
