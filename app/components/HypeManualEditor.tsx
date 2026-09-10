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

type ApiPayload = {
  ok?: boolean;
  error?: string;
  message?: string;
  invalidRanks?: number[];
  found?: number;
  required?: number;
  playlistId?: string | null;
};

export function HypeManualEditor({ currentVideoIds = [], observedAt = null }: Props) {
  const router = useRouter();
  const initialLinks = useMemo(() => Array.from({ length: 10 }, (_, index) => {
    const id = currentVideoIds[index] ?? '';
    return id ? `https://www.youtube.com/watch?v=${id}` : '';
  }), [currentVideoIds]);

  const [open, setOpen] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [links, setLinks] = useState<string[]>(initialLinks);
  const [secret, setSecret] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  function resetStatus() {
    if (status !== 'idle') {
      setStatus('idle');
      setMessage('');
    }
  }

  function updateLink(index: number, value: string) {
    setLinks((current) => current.map((link, position) => position === index ? value : link));
    resetStatus();
  }

  function describeApiError(payload: ApiPayload): string {
    if (payload.error === 'unauthorized') return 'Chave administrativa inválida.';
    if (payload.error === 'invalid_youtube_playlist_url') return 'Link de playlist do YouTube inválido.';
    if (payload.error === 'youtube_api_key_not_configured') return 'YOUTUBE_API_KEY não está configurada no servidor.';
    if (payload.error === 'youtube_playlist_fetch_failed') return 'O YouTube não permitiu ler essa playlist. Verifique se ela é pública e tente novamente.';
    if (payload.error === 'youtube_playlist_has_fewer_than_10_videos') {
      return `A playlist retornou apenas ${payload.found ?? 0} vídeos válidos; são necessários ${payload.required ?? 10}.`;
    }
    if (payload.error === 'youtube_playlist_contains_duplicate_videos_top_10') return 'Há vídeos duplicados entre as dez primeiras posições da playlist.';
    if (payload.error === 'invalid_youtube_links') return `Link inválido na posição: ${(payload.invalidRanks ?? []).join(', ')}.`;
    if (payload.error === 'duplicate_video_links') return 'Há vídeos duplicados na lista.';
    if (payload.error === 'exactly_10_links_required') return 'O ranking deve conter exatamente 10 vídeos.';
    if (payload.error === 'manual_hype_secret_required') return 'A chave administrativa ainda não foi configurada no servidor.';
    return payload.error ?? 'Falha ao salvar o ranking Hype.';
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = links.map(asYoutubeUrl);
    const usePlaylist = Boolean(playlistUrl.trim());

    if (!usePlaylist && normalized.some((link) => !link)) {
      setStatus('error');
      setMessage('Cole uma playlist do YouTube ou preencha os 10 links individuais na ordem do ranking Hype.');
      return;
    }
    if (!secret.trim()) {
      setStatus('error');
      setMessage('Informe a chave administrativa do projeto.');
      return;
    }

    setStatus('saving');
    setMessage(usePlaylist ? 'Importando as 10 primeiras posições da playlist…' : 'Salvando novo snapshot…');

    try {
      const response = await fetch('/api/hype/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret.trim()}`
        },
        body: JSON.stringify(usePlaylist
          ? { playlistUrl: playlistUrl.trim() }
          : { links: normalized })
      });
      const payload = await response.json() as ApiPayload;

      if (!response.ok || !payload.ok) {
        throw new Error(describeApiError(payload));
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
        {open ? 'Fechar atualização do Hype' : 'Atualizar Top 10 Hype'}
      </button>

      {open ? (
        <form className={styles.panel} onSubmit={submit}>
          <div className={styles.heading}>
            <div>
              <strong>Novo snapshot do YouTube Hype Brasil</strong>
              <p>Preferencialmente, cole a playlist do ranking. O sistema lê as 10 primeiras posições e salva #1 a #10 exatamente na ordem da playlist. Os 10 links individuais continuam disponíveis como alternativa.</p>
            </div>
            {observedAt ? <span>Snapshot ativo já existe</span> : <span>Sem snapshot ativo</span>}
          </div>

          <div className={styles.playlistBox}>
            <label className={styles.playlistRow}>
              <span>Playlist Hype</span>
              <input
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://www.youtube.com/playlist?list=..."
                value={playlistUrl}
                onChange={(event) => {
                  setPlaylistUrl(event.target.value);
                  resetStatus();
                }}
              />
            </label>
            <p>Se este campo estiver preenchido, a playlist tem prioridade e os links individuais abaixo são ignorados neste envio.</p>
          </div>

          <div className={styles.divider}><span>ou use os 10 links individuais</span></div>

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
                  required={!playlistUrl.trim()}
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
              {status === 'saving'
                ? (playlistUrl.trim() ? 'Importando playlist…' : 'Salvando…')
                : (playlistUrl.trim() ? 'Importar playlist e salvar Top 10' : 'Salvar Top 10 como novo snapshot')}
            </button>
            <span>Os snapshots antigos não são apagados do Neon.</span>
          </div>

          {message ? <div className={status === 'error' ? styles.error : status === 'success' ? styles.success : styles.message}>{message}</div> : null}
        </form>
      ) : null}
    </div>
  );
}
