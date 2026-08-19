export const GLOBAL_CONTENT_POLICY = {
  country: 'BR',
  language: 'pt',
  minimumDurationSeconds: 8 * 60,
  excludedVideoCategoryIds: new Set(['10']), // Music
  blockedChannels: [
    'enaldinho',
    'felipe neto',
    'luccas neto',
    'gato galactico',
    'gato galático',
    'cadres',
    'authenticgames',
    'authentic games',
    'rezendeevil',
    'rezende evil',
    'jazzghost',
    'tazercraft',
    'robin hood gamer',
    'tex hs',
    'favela sound'
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

export function evaluateContentEligibility(candidate: ContentCandidate): ContentEligibility {
  const reasons: string[] = [];
  const channelText = `${candidate.channelTitle} ${candidate.channelDescription ?? ''}`;
  const videoText = `${candidate.title} ${candidate.description ?? ''} ${(candidate.tags ?? []).join(' ')}`;
  const normalizedChannel = normalize(candidate.channelTitle);

  if (
    candidate.durationSeconds !== undefined &&
    candidate.durationSeconds < GLOBAL_CONTENT_POLICY.minimumDurationSeconds
  ) {
    reasons.push('shorter-than-8-minutes');
  }

  if (candidate.liveBroadcastContent && candidate.liveBroadcastContent !== 'none') {
    reasons.push('live-or-upcoming');
  }

  if (
    candidate.categoryId &&
    GLOBAL_CONTENT_POLICY.excludedVideoCategoryIds.has(candidate.categoryId)
  ) {
    reasons.push('music-category');
  }

  if (containsAny(videoText, GLOBAL_CONTENT_POLICY.musicMarkers)) {
    reasons.push('music-content');
  }

  if (containsAny(channelText, GLOBAL_CONTENT_POLICY.musicChannelMarkers)) {
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

  return {
    allowed: reasons.length === 0,
    reasons
  };
}

export function filterEligibleContent<T extends ContentCandidate>(items: T[]): T[] {
  return items.filter((item) => evaluateContentEligibility(item).allowed);
}
