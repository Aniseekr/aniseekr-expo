export type ShareTemplateId = 'top10' | 'yearly_best' | 'starter_pack' | 'masterpiece';

export interface ShareTemplate {
  id: ShareTemplateId;
  title: string;
  description: string;
  emoji: string;
  needsManualPick: boolean;
}

export interface ShareEntry {
  animeId: string;
  title: string;
  coverUrl?: string;
  score?: number;
  year?: number;
  tag?: string;
  synopsis?: string;
}

export interface ShareTemplateBuild {
  template: ShareTemplate;
  entries: ShareEntry[];
  meta?: { username?: string; year?: number };
}

export interface ShareSourceItem {
  id: string;
  title: string;
  coverUrl?: string;
  score?: number;
  year?: number;
  status?: string;
  synopsis?: string;
}

export const SHARE_TEMPLATES: ShareTemplate[] = [
  {
    id: 'top10',
    title: 'Top 10',
    description: 'Your highest-rated anime',
    emoji: '🏆',
    needsManualPick: false,
  },
  {
    id: 'yearly_best',
    title: 'Yearly Best',
    description: 'Top 3 from each of last 4 years',
    emoji: '📅',
    needsManualPick: false,
  },
  {
    id: 'starter_pack',
    title: 'Starter Pack',
    description: 'Six anime to recommend to a newcomer',
    emoji: '🎒',
    needsManualPick: true,
  },
  {
    id: 'masterpiece',
    title: 'Masterpiece',
    description: 'A single hero pick worth a poster',
    emoji: '👑',
    needsManualPick: true,
  },
];

const STARTER_TAGS = [
  '⚔️ Action',
  '💕 Romance',
  '🌌 Sci-fi',
  '😂 Comedy',
  '🌸 Slice of Life',
  '🔮 Fantasy',
];

function toEntry(item: ShareSourceItem, tag?: string): ShareEntry {
  return {
    animeId: item.id,
    title: item.title,
    coverUrl: item.coverUrl,
    score: item.score,
    year: item.year,
    tag,
    synopsis: item.synopsis,
  };
}

function rankByScore(items: ShareSourceItem[]): ShareSourceItem[] {
  return [...items]
    .filter((it) => typeof it.score === 'number' && (it.score ?? 0) > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

function buildTop10(items: ShareSourceItem[], options?: { username?: string }): ShareTemplateBuild {
  const ranked = rankByScore(items).slice(0, 10);
  return {
    template: SHARE_TEMPLATES[0],
    entries: ranked.map((it) => toEntry(it)),
    meta: { username: options?.username },
  };
}

function buildYearlyBest(
  items: ShareSourceItem[],
  options?: { username?: string }
): ShareTemplateBuild {
  const now = new Date().getFullYear();
  const targetYears = [now, now - 1, now - 2, now - 3];

  const buckets: ShareEntry[] = [];
  for (const year of targetYears) {
    const top = rankByScore(items.filter((it) => it.year === year)).slice(0, 3);
    top.forEach((it) => buckets.push(toEntry({ ...it, year })));
  }

  return {
    template: SHARE_TEMPLATES[1],
    entries: buckets,
    meta: { username: options?.username, year: now },
  };
}

function buildStarterPack(
  items: ShareSourceItem[],
  options?: { username?: string }
): ShareTemplateBuild {
  const ranked = rankByScore(items).slice(0, 6);
  return {
    template: SHARE_TEMPLATES[2],
    entries: ranked.map((it, idx) => toEntry(it, STARTER_TAGS[idx % STARTER_TAGS.length])),
    meta: { username: options?.username },
  };
}

function buildMasterpiece(
  items: ShareSourceItem[],
  options?: { username?: string }
): ShareTemplateBuild {
  const top = rankByScore(items).slice(0, 1);
  return {
    template: SHARE_TEMPLATES[3],
    entries: top.map((it) => toEntry(it)),
    meta: { username: options?.username },
  };
}

export function buildShareTemplate(
  templateId: ShareTemplateId,
  items: ShareSourceItem[],
  options?: { username?: string }
): ShareTemplateBuild {
  switch (templateId) {
    case 'top10':
      return buildTop10(items, options);
    case 'yearly_best':
      return buildYearlyBest(items, options);
    case 'starter_pack':
      return buildStarterPack(items, options);
    case 'masterpiece':
      return buildMasterpiece(items, options);
  }
}
