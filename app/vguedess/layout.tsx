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
          <span>YOUTUBE HYPE · PLAYLIST SINCRONIZADA</span>
          <strong>Sincronização automática ativa</strong>
          <p>A playlist oficial é verificada automaticamente quando o radar é consultado, com janela mínima de 15 minutos, e também pelo cron diário. Um novo snapshot só é criado quando o Top 10 ou sua ordem realmente muda. O painel abaixo permanece como atualização manual de emergência.</p>
        </div>
        <HypeManualEditor currentVideoIds={current?.videoIds ?? []} observedAt={current?.observedAt ?? null} />
      </aside>
    </>
  );
}
