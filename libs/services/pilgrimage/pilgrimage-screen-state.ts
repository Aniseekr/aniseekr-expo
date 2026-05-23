import type { LatLng } from './location-service';
import { getIndexedById, type AnitabiIndexEntry } from './anitabi-index';
import type { AnitabiBangumi, AnitabiPoint } from './types';

export function seedPilgrimageAnimeFromIndex(entry: AnitabiIndexEntry): AnitabiBangumi {
  return {
    id: entry.id,
    cn: entry.cn,
    title: entry.title,
    city: entry.city,
    cover: entry.cover,
    color: entry.color,
    geo: [entry.lat, entry.lng],
    zoom: entry.zoom,
    modified: entry.builtAt,
    litePoints: [],
    pointsLength: entry.pointsLength,
    imagesLength: 0,
  };
}

export function buildSeededPilgrimageAnimes(ids: readonly number[]): AnitabiBangumi[] {
  const seeded: AnitabiBangumi[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const entry = getIndexedById(id);
    if (entry) seeded.push(seedPilgrimageAnimeFromIndex(entry));
  }
  return seeded.sort((a, b) => (b.pointsLength ?? 0) - (a.pointsLength ?? 0));
}

export function appendIndexedEntries(
  prev: Map<number, AnitabiIndexEntry>,
  entries: readonly AnitabiIndexEntry[]
): Map<number, AnitabiIndexEntry> {
  if (entries.length === 0) return prev;
  let next: Map<number, AnitabiIndexEntry> | null = null;
  for (const entry of entries) {
    if (prev.has(entry.id) || next?.has(entry.id)) continue;
    if (!next) next = new Map(prev);
    next.set(entry.id, entry);
  }
  return next ?? prev;
}

export function appendIndexedEntriesExcludingKnownAnimes(
  prev: Map<number, AnitabiIndexEntry>,
  entries: readonly AnitabiIndexEntry[],
  animes: readonly Pick<AnitabiBangumi, 'id'>[]
): Map<number, AnitabiIndexEntry> {
  if (entries.length === 0) return prev;
  const known = buildKnownAnimeIdSet(animes, prev);
  const filtered = entries.filter((entry) => !known.has(entry.id));
  return appendIndexedEntries(prev, filtered);
}

export function buildKnownAnimeIdSet(
  animes: readonly Pick<AnitabiBangumi, 'id'>[],
  extraIndexed: ReadonlyMap<number, AnitabiIndexEntry>
): Set<number> {
  const seen = new Set<number>();
  for (const anime of animes) seen.add(anime.id);
  for (const id of extraIndexed.keys()) seen.add(id);
  return seen;
}

export function sameLatLng(a: LatLng | null, b: LatLng | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.latitude === b.latitude && a.longitude === b.longitude;
}

export function samePointIds(
  a: readonly Pick<AnitabiPoint, 'id'>[],
  b: readonly Pick<AnitabiPoint, 'id'>[]
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].id !== b[i].id) return false;
  }
  return true;
}
