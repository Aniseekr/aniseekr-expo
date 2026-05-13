// Offline lookup for the Japanese Anime Tourism 88 (animetourism88.com) annual
// selection. Pure module: reads the bundled JSON, no network.
//
// The 88 selection is anime × city; one anime may appear in several rows
// (e.g. ゆるキャン△ × 6 cities). `get88EntriesByBangumiId` returns every row
// for an anime, while `getUnique88Anime` collapses them into one card per
// anime with its location list.
//
// Regenerate with: `bun run scripts/build-anime-tourism-88.ts`.

import dataJson from './anime-tourism-88.data.json';
import { getCityCentroid } from './jp-city-centroids';

export const ANIME_TOURISM_88_REGIONS = [
  'hokkaido_tohoku',
  'kanto',
  'tokyo',
  'chubu',
  'kinki',
  'chugoku_shikoku',
  'kyushu_okinawa',
] as const;

export type AnimeTourism88Region = (typeof ANIME_TOURISM_88_REGIONS)[number];

export interface AnimeTourism88ExternalIds {
  bangumi: number | null;
  anilist: number | null;
  mal: number | null;
}

export interface AnimeTourism88Entry {
  /** Sequential id within the year's list (1..N). */
  id: number;
  /** Edition year, e.g. 2025. */
  year: number;
  /** Japanese title (canonical). */
  titleJa: string;
  /** English title from the EN edition page. */
  titleEn: string;
  /** Region group used by animetourism88.com (Tokyo is split from Kanto). */
  region: AnimeTourism88Region;
  /** Japanese prefecture, e.g. "東京都" / "京都府" / "北海道". */
  prefecture: string;
  /** City/ward/town within the prefecture, e.g. "世田谷区" / "函館市". */
  city: string;
  /** Raw "Region / City" string as shown in the EN edition table. */
  regionEn: string;
  /** Cross-platform anime IDs. Bangumi is always resolved; anilist/mal may be null. */
  externalIds: AnimeTourism88ExternalIds;
  /** AniList popularity score (null when unresolved on AniList — e.g. tokusatsu). */
  anilistPopularity?: number | null;
  /** AniList mean score 0..100 (null when unresolved). */
  anilistMeanScore?: number | null;
  /** Free-form note when AniList match used fallback/substring; surface to admin tooling. */
  anilistReviewNote?: string;
}

interface DataFile {
  generatedAt: string;
  resolvedAt?: string;
  source: string;
  year: number;
  count: number;
  entries: AnimeTourism88Entry[];
}

const DATA = dataJson as unknown as DataFile;

export interface UniqueAnime88Entry {
  bangumiId: number;
  titleJa: string;
  titleEn: string;
  /** Every 88 row that maps to this bangumi id (1..N rows). */
  locations: AnimeTourism88Entry[];
  /** Distinct regions this anime touches. */
  regions: AnimeTourism88Region[];
  /** Highest AniList popularity score across this anime's rows; null when unresolved. */
  anilistPopularity: number | null;
}

/** All 88 rows, in the canonical 1..N order. Do NOT mutate. */
export function getAll88Entries(): readonly AnimeTourism88Entry[] {
  return DATA.entries;
}

/** Year of the bundled selection (e.g. 2025). */
export function get88EditionYear(): number {
  return DATA.year;
}

/** Total row count (anime × city pairs). */
export function get88EntryCount(): number {
  return DATA.entries.length;
}

/** All rows for a single anime. Empty array if the anime is not in the 88 list. */
export function get88EntriesByBangumiId(
  bangumiId: number | null | undefined
): AnimeTourism88Entry[] {
  if (typeof bangumiId !== 'number' || !Number.isFinite(bangumiId)) return [];
  return DATA.entries.filter((e) => e.externalIds.bangumi === bangumiId);
}

/** Rows whose region matches. Region ids are the 7-group taxonomy. */
export function get88EntriesByRegion(
  region: AnimeTourism88Region
): AnimeTourism88Entry[] {
  return DATA.entries.filter((e) => e.region === region);
}

/** Whether an anime (by Bangumi id) is part of the current 88 selection. */
export function is88(bangumiId: number | null | undefined): boolean {
  if (typeof bangumiId !== 'number' || !Number.isFinite(bangumiId)) return false;
  return DATA.entries.some((e) => e.externalIds.bangumi === bangumiId);
}

export interface AnimeTourism88EntryWithCoords extends AnimeTourism88Entry {
  /** City centroid in WGS84, from jp-city-centroids.data.json. */
  lat: number;
  lng: number;
}

/**
 * Every 88 row joined to its (prefecture, city) centroid. Rows whose city has
 * no geocoded centroid are dropped — caller can still get the un-joined row
 * via `getAll88Entries()` if they need to render an unmapped fallback.
 */
export function get88EntriesWithCoords(): AnimeTourism88EntryWithCoords[] {
  const out: AnimeTourism88EntryWithCoords[] = [];
  for (const entry of DATA.entries) {
    const centroid = getCityCentroid(entry.prefecture, entry.city);
    if (!centroid) continue;
    out.push({ ...entry, lat: centroid.lat, lng: centroid.lng });
  }
  return out;
}

/**
 * One entry per unique anime (collapses multi-city anime into a single record
 * with its location list). Order follows the first-seen row order of the
 * canonical list.
 *
 * Rows with `externalIds.bangumi === null` are skipped, since downstream
 * features (collection-link, AniList popularity) cannot key on a null id.
 */
export function getUnique88Anime(): UniqueAnime88Entry[] {
  const seen = new Map<number, UniqueAnime88Entry>();
  for (const entry of DATA.entries) {
    const bangumiId = entry.externalIds.bangumi;
    if (typeof bangumiId !== 'number') continue;
    const popularity = typeof entry.anilistPopularity === 'number' ? entry.anilistPopularity : null;
    const existing = seen.get(bangumiId);
    if (existing) {
      existing.locations.push(entry);
      if (!existing.regions.includes(entry.region)) {
        existing.regions.push(entry.region);
      }
      if (popularity !== null) {
        existing.anilistPopularity = Math.max(existing.anilistPopularity ?? 0, popularity);
      }
    } else {
      seen.set(bangumiId, {
        bangumiId,
        titleJa: entry.titleJa,
        titleEn: entry.titleEn,
        locations: [entry],
        regions: [entry.region],
        anilistPopularity: popularity,
      });
    }
  }
  return Array.from(seen.values());
}

/**
 * Same as `getUnique88Anime` but sorted by AniList popularity descending.
 * Anime with no AniList resolution sort last in canonical (id) order so the
 * tail stays deterministic between renders.
 */
export function getUnique88AnimeByPopularity(): UniqueAnime88Entry[] {
  return getUnique88Anime().sort((a, b) => {
    const ap = a.anilistPopularity ?? -1;
    const bp = b.anilistPopularity ?? -1;
    if (ap !== bp) return bp - ap;
    return a.locations[0].id - b.locations[0].id;
  });
}
