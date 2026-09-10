'use client';

import { usePathname } from 'next/navigation';
import styles from './site-tabs.module.css';

const TABS = [
  { href: '/', label: 'Radar geral', match: (path: string) => path === '/' },
  { href: '/vguedess', label: 'Meu canal · @vguedess', match: (path: string) => path.startsWith('/vguedess') },
  { href: '/complex-search', label: 'ComplexSearch', match: (path: string) => path.startsWith('/complex-search') },
  { href: '/studio', label: 'Studio de Roteiro', match: (path: string) => path.startsWith('/studio') }
] as const;

export function SiteTabs() {
  const pathname = usePathname();

  return (
    <div className={styles.shell}>
      <nav className={styles.tabs} aria-label="Áreas do YouTube Intelligence">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <a
              key={tab.href}
              href={tab.href}
              className={active ? styles.active : styles.tab}
              aria-current={active ? 'page' : undefined}
            >
              {tab.label}
            </a>
          );
        })}
      </nav>
      <div className={styles.context}>
        {pathname.startsWith('/vguedess')
          ? 'Visão personalizada: filtros, interesses e regras desta aba não alteram o Radar geral.'
          : pathname.startsWith('/complex-search')
            ? 'Mapa persistente de temas externos conectados aos sinais observados no YouTube e no X.'
            : pathname.startsWith('/studio')
              ? 'Criação e avaliação de roteiro.'
              : 'Visão de mercado sem personalização do canal.'}
      </div>
    </div>
  );
}
