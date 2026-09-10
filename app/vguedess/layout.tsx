import { HypeManualEditor } from '@/app/components/HypeManualEditor';
import { getLatestManualHypeSnapshot } from '@/lib/youtube-history-db';
import styles from './vguedess-hype-editor.module.css';

export const dynamic = 'force-dynamic';

export default async function VguedessLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const current = await getLatestManualHypeSnapshot('BR');

  return (
    <>
      {children}
      <aside className={styles.shell} aria-label="Atualização do ranking Hype">
        <div className={styles.copy}>
          <span>YOUTUBE HYPE · PLAYLIST OU ENTRADA MANUAL</span>
          <strong>Atualizar Top 10</strong>
          <p>Cole a playlist do Hype para importar automaticamente as dez primeiras posições. O novo lote substitui o ranking ativo, mas os snapshots anteriores permanecem armazenados no banco.</p>
        </div>
        <HypeManualEditor currentVideoIds={current?.videoIds ?? []} observedAt={current?.observedAt ?? null} />
      </aside>
    </>
  );
}
