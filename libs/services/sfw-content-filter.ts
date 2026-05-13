export const NSFW_TAGS = [
  'Hentai',
  'Ecchi',
  'Erotic',
  'Nudity',
  'Sexual Violence',
  'Bondage',
  'Incest',
  'Tentacles',
  'Masturbation',
  'Futanari',
  'Yuri',
  'Yaoi',
  'BDSM',
  'Rape',
  'Sex',
  'Oral Sex',
  'Anal Sex',
  'Ecchi 18+',
  'R18',
  'R-18',
  'Adult',
] as const;

export const NSFW_GENRES = ['Hentai', 'Erotica', 'Ecchi', 'Harem', 'R18', 'R-18', 'Adult'] as const;

export interface SFWContentLike {
  genres?: readonly string[] | null;
  tags?: readonly string[] | null;
  isAdult?: boolean | null;
  isR18?: boolean | null;
  rating?: string | null;
}

const NSFW_TAG_SET = new Set(NSFW_TAGS.map(normalizeAdultLabel));
const NSFW_GENRE_SET = new Set(NSFW_GENRES.map(normalizeAdultLabel));

export function normalizeAdultLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function hasAdultRatingSignal(rating: string | null | undefined): boolean {
  if (!rating) return false;
  const normalized = normalizeAdultLabel(rating);
  return (
    normalized.startsWith('rx') ||
    normalized.includes('hentai') ||
    normalized === 'r18' ||
    normalized === 'r-18' ||
    normalized === '18+'
  );
}

export function hasAdultContentSignal(item: SFWContentLike): boolean {
  if (item.isAdult === true || item.isR18 === true) return true;
  if (hasAdultRatingSignal(item.rating)) return true;

  for (const genre of item.genres ?? []) {
    if (NSFW_GENRE_SET.has(normalizeAdultLabel(genre))) return true;
  }

  for (const tag of item.tags ?? []) {
    if (NSFW_TAG_SET.has(normalizeAdultLabel(tag))) return true;
  }

  return false;
}

export function isSFWContent(item: SFWContentLike): boolean {
  return !hasAdultContentSignal(item);
}

export function filterSFWContent<T extends SFWContentLike>(items: readonly T[]): T[] {
  return items.filter(isSFWContent);
}
