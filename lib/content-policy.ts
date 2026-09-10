export const GLOBAL_CONTENT_POLICY = {
  country: 'BR',
  language: 'pt',
  minimumDurationSeconds: 8 * 60,
  excludedVideoCategoryIds: new Set(['10']), // Music
  blockedChannels: [
    'enaldinho',
    'felipe neto',
    'luccas neto',
    'emilly vick',
    'gato galactico',
    'gato galático',
    'cadres',
    'authenticgames',
    'authentic games',
    'rezende',
    'rezendeevil',
    'rezende evil',
    'jazzghost',
    'tazercraft',
    'robin hood gamer',
    'tex hs',
    'favela sound'
  ],
  // Curadoria explícita do projeto. A razão é interna e não deve ser exibida
  // como acusação factual sobre o canal; serve apenas para excluir fontes que
  // o usuário decidiu não usar como referência editorial ou sinal de oportunidade.
  editorialExcludedChannels: [
    'carol capel'
  ],
  musicMarkers: [
    'official music video',
    'clipe oficial',
    'videoclipe oficial',
    'lyric video',
    'lyrics video',
    'letra oficial',
    'álbum completo',
    'album completo',
    'cd de paredão',
    'cd de paredao',
    'playlist musical',
    'vevo'
  ],
  // Categoria 10 do YouTube e canais musicais não significam necessariamente
  // que o vídeo seja uma faixa/clipe. Ensaios, minidocs e análises long-form
  // sobre música devem continuar elegíveis.
  musicEditorialTitleMarkers: [
    'voce ouviu',
    'a vida toda',
    'documentario',
    'minidoc',
    'mini doc',
    'video essay',
    'ensaio',
    'analise',
    'explicando',
    'entenda',
    'por tras',
    'o que aconteceu',
    'historia de',
    'historia do',
    'historia da'
  ],
  musicChannelMarkers: [
    ' music',
    'música',
    'musica',
    'records',
    'recordings',
    'gravadora',
    'vevo',
    'sound',
    'som livre'
  ],
  kidsChannelMarkers: [
    'kids',
    'infantil',
    'baby',
    'criança',
    'crianca',
    'mundo bita',
    'galinha pintadinha',
    'turma da mônica',
    'turma da monica'
  ],
  preteenContentMarkers: [
    'minecraft',
    'roblox',
    'blox fruits',
    'brookhaven',
    'skibidi',
    'tung tung',
    'brainrot',
    'poppy playtime',
    'rainbow friends',
    'teardown',
    'spider-man',
    'spiderman',
    'homem aranha',
    'escola do jazzghost',
    'gta multiverse',
    'minegirl',
    'minegril'
  ],
  religiousChannelMarkers: [
    'igreja',
    'ministério',
    'ministerio',
    'pastor',
    'bispo',
    'gospel',
    'louvor',
    'evangelho',
    'católica',
    'catolica',
    'católico',
    'catolico',
    'espírita',
    'espirita',
    'oração',
    'oracao',
    'pregação',
    'pregacao'
  ]
} as const;

export type ContentCandidate = {
  videoId?: string;
  title: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  durationSeconds?: number;
  liveBroadcastContent?: string;
  madeForKids?: boolean;
  channelTitle: string;
  channelDescription?: string;
  channelMadeForKids?: boolean;
};

export type ContentEligibility = {
  allowed: boolean;
  reasons: string[];
};

function normalize(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAny(value: string, markers: readonly string[]): boolean {
  const normalized = normalize(value);
  return markers.some((marker) => normalized.includes(normalize(marker)));
}

function looksLikeMusicEditorialVideo(candidate: ContentCandidate): boolean {
  const durationSeconds = candidate.durationSeconds ?? 0;
  if (durationSeconds < GLOBAL_CONTENT_POLICY.minimumDurationSeconds) return false;

  const normalizedTitle = normalize(candidate.title);
  if (containsAny(candidate.title, GLOBAL_CONTENT_POLICY.musicEditorialTitleMarkers)) return true;

  // Títulos longos em forma de pergunta/explicação são um sinal adicional de
  // conteúdo editorial. Evita liberar uma faixa longa chamada apenas "Por Que",
  // por exemplo, mas preserva vídeos do tipo "Por que você ouviu X errado?".
  const explanatoryLead =
    normalizedTitle.includes('por que ') ||
    normalizedTitle.startsWith('como ') ||
    normalizedTitle.startsWith('o que ');
  const editorialShape = /[?!:]/.test(candidate.title) || normalizedTitle.length >= 32;

  return explanatoryLead && editorialShape;
}

export function isEditoriallyExcludedChannel(channelTitle: string): boolean {
  const normalizedChannel = normalize(channelTitle);
  return GLOBAL_CONTENT_POLICY.editorialExcludedChannels.some((blocked) =>
    normalizedChannel.includes(normalize(blocked))
  );
}

export function evaluateContentEligibility(candidate: ContentCandidate): ContentEligibility {
  const reasons: string[] = [];
  const channelText = `${candidate.channelTitle} ${candidate.channelDescription ?? ''}`;
  const videoText = `${candidate.title} ${candidate.description ?? ''} ${(candidate.tags ?? []).join(' ')}`;
  const normalizedChannel = normalize(candidate.channelTitle);
  const musicEditorialVideo = looksLikeMusicEditorialVideo(candidate);
  const explicitMusicTitle = containsAny(candidate.title, GLOBAL_CONTENT_POLICY.musicMarkers);
  const musicMarkerAnywhere = containsAny(videoText, GLOBAL_CONTENT_POLICY.musicMarkers);

  if (
    candidate.durationSeconds !== undefined &&
    candidate.durationSeconds < GLOBAL_CONTENT_POLICY.minimumDurationSeconds
  ) {
    reasons.push('shorter-than-8-minutes');
  }

  if (candidate.liveBroadcastContent && candidate.liveBroadcastContent !== 'none') {
    reasons.push('live-or-upcoming');
  }

  // Um título que se declara explicitamente clipe/lyric/álbum completo continua
  // sendo música. Porém, termos musicais encontrados somente em descrição/tags
  // não derrubam um vídeo que o título+duração identificam como ensaio/minidoc.
  if (explicitMusicTitle || (musicMarkerAnywhere && !musicEditorialVideo)) {
    reasons.push('music-content');
  }

  if (
    candidate.categoryId &&
    GLOBAL_CONTENT_POLICY.excludedVideoCategoryIds.has(candidate.categoryId) &&
    !musicEditorialVideo
  ) {
    reasons.push('music-category');
  }

  if (
    containsAny(channelText, GLOBAL_CONTENT_POLICY.musicChannelMarkers) &&
    !musicEditorialVideo
  ) {
    reasons.push('music-channel');
  }

  if (candidate.madeForKids || candidate.channelMadeForKids) {
    reasons.push('made-for-kids');
  }

  if (containsAny(channelText, GLOBAL_CONTENT_POLICY.kidsChannelMarkers)) {
    reasons.push('kids-channel');
  }

  if (containsAny(videoText, GLOBAL_CONTENT_POLICY.preteenContentMarkers)) {
    reasons.push('preteen-content-marker');
  }

  if (containsAny(channelText, GLOBAL_CONTENT_POLICY.religiousChannelMarkers)) {
    reasons.push('religious-channel');
  }

  if (
    GLOBAL_CONTENT_POLICY.blockedChannels.some((blocked) =>
      normalizedChannel.includes(normalize(blocked))
    )
  ) {
    reasons.push('preteen-channel-blocklist');
  }

  if (isEditoriallyExcludedChannel(candidate.channelTitle)) {
    reasons.push('editorial-channel-exclusion');
  }

  return {
    allowed: reasons.length === 0,
    reasons
  };
}

export function filterEligibleContent<T extends ContentCandidate>(items: T[]): T[] {
  return items.filter((item) => evaluateContentEligibility(item).allowed);
}
