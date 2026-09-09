'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hype-manual-editor.module.css';

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function asYoutubeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (VIDEO_ID_RE.test(trimmed)) return `https://www.youtube.com/watch?v=${trimmed}`;
  return trimmed;
}

type Props = {
  currentVideoIds?: string[];
  observedAt?: string | null;
};

export function HypeManualEditor({ currentVideoIds = [], observedAt = null }: Props) {
  const router = useRouter();
  const initialLinks = useMemo(() => Array.from({ length: 10 }, (_, index) => {
    const id = currentVideoIds[index] ?? '';
    return id ? `https://www.youtube.com/watch?v=${id}` : '';
  }), [currentVideoIds]);

  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<string[]>(initialLinks);
  const [secret, setSecret] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  function updateLink(index: number, value: string) {
    setLinks((current) => current.map((link, position) => position === index ? value : link));
    if (status !== 'idle') {
      setStatus('idle');
      setMessage('');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = links.map(asYoutubeUrl);

    if (normalized.some((link) => !link)) {
      setStatus('error');
      setMessage('Preencha os 10 links, na ordem exata do ranking Hype.');
      return;
    }
    if (!secret.trim()) {
      setStatus('error');
      setMessage('Informe a chave administrativa do projeto.');
      return;
    }

    setStatus('saving');
    setMessage('Salvando novo snapshot…');

    try {
      const response = await fetch('/api/hype/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret.trim()}`
        },
        body: JSON.stringify({ links: normalized })
      });
      const payload = await response.json() as {
        ok?: boolean;
        error?: string;
        message?: string;
        invalidRanks?: number[];
      };

      if (!response.ok || !payload.ok) {
        if (payload.error === 'unauthorized') throw new Error('Chave administrativa inválida.');
        if (payload.error === 'invalid_youtube_links') {
          throw new Error(`Link inválido na posição: ${(payload.invalidRanks ?? []).join(', ')}.`);
        }
        if (payload.error === 'duplicate_video_links') throw new Error('Há vídeos duplicados na lista.');
        if (payload.error === 'exactly_10_links_required') throw new Error('O ranking deve conter exatamente 10 vídeos.');
        throw new Error(payload.error ?? 'Falha ao salvar o ranking Hype.');
      }

      setStatus('success');
      setMessage(payload.message ?? 'Top 10 salvo no banco de dados.');
      router.refresh();
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Falha ao salvar o ranking Hype.');
    }
  }

  return (
    <div className={styles.editor}>
      <button className={styles.toggle} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {open ? 'Fechar atualização manual' : 'Atualizar Top 10 Hype manualmente'}
      </button>

      {open ? (
        <form className={styles.panel} onSubmit={submit}>
          <div className={styles.heading}>
            <div>
              <strong>Novo snapshot do YouTube Hype Brasil</strong>
              <p>Cole os 10 links em ordem, do HYPE #1 ao HYPE #10. O lote é salvo de forma consolidada e só deixa de ser o ranking ativo quando um novo lote for gravado.</p>
            </div>
            {observedAt ? <span>Snapshot ativo já existe</span> : <span>Sem snapshot ativo</span>}
          </div>

          <div className={styles.inputs}>
            {links.map((link, index) => (
              <label className={styles.row} key={index}>
                <span>#{index + 1}</span>
                <input
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={link}
                  onChange={(event) => updateLink(index, event.target.value)}
                  required
                />
              </label>
            ))}
          </div>

          <label className={styles.secretRow}>
            <span>Chave administrativa</span>
            <input
              type="password"
              autoComplete="current-password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="MANUAL_HYPE_SECRET ou CRON_SECRET"
              required
            />
          </label>

          <div className={styles.actions}>
            <button type="submit" disabled={status === 'saving'}>
              {status === 'saving' ? 'Salvando…' : 'Salvar Top 10 como novo snapshot'}
            </button>
            <span>Os snapshots antigos não são apagados do Neon.</span>
          </div>

          {message ? <div className={status === 'error' ? styles.error : status === 'success' ? styles.success : styles.message}>{message}</div> : null}
        </form>
      ) : null}
    </div>
  );
}
