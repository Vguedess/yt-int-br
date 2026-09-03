'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '@/app/leaders.module.css';

type Props = {
  canRefresh: boolean;
  nextRefreshAt: string;
};

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function LeaderRefreshButton({ canRefresh, nextRefreshAt }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    if (!canRefresh || loading) return;
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/leaders', {
        method: 'POST',
        headers: { Accept: 'application/json' }
      });
      const payload = await response.json() as { ok?: boolean; error?: string };

      if (!response.ok && response.status !== 409) {
        throw new Error(payload.error ?? 'Falha ao atualizar os dados.');
      }

      if (response.status === 409) {
        setMessage('Os dados ainda estão dentro da janela de 12 horas.');
      } else {
        setMessage('Dados atualizados.');
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao atualizar os dados.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.refreshWrap}>
      <button
        className={styles.refreshButton}
        type="button"
        disabled={!canRefresh || loading}
        onClick={refresh}
      >
        {loading ? 'Atualizando…' : 'Atualizar agora'}
      </button>
      <span className={styles.refreshHint}>
        {canRefresh ? 'Nova coleta liberada' : `Disponível após ${formatTime(nextRefreshAt)}`}
      </span>
      {message ? <span className={styles.refreshMessage}>{message}</span> : null}
    </div>
  );
}
