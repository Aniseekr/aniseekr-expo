// L2 cross-index: maps each Anitabi (Bangumi-keyed) entry to its AniList and
// MyAnimeList ids so the pilgrimage feature can resolve `bangumiId` for users
// who browse with AniList or MAL as their source platform — without going
// through the slower SQLite-backed IDMappingService (L1).
//
// Built offline by `scripts/build-anitabi-cross-index.ts` (rate-limited
// AniList GraphQL search). At runtime this module is pure: no network, no
// SQLite, just three lookup Maps populated at module load.
//
// Regenerate with: `bun run scripts/build-anitabi-cross-index.ts`.

import data from './anitabi-cross-index.data.json';

/**
 * One resolved row. `matchType` tracks how confident we are in the AniList
 * link — the UI may treat `top1_fallback` results more conservatively if we
 * surface this in future.
 */
export interface AnitabiCrossIndexEntry {
  /** Bangumi subject id — the canonical key shared with anitabi-index. */
  bangumiId: number;
  /** AniList id when resolved, else `null`. */
  anilistId: number | null;
  /** MyAnimeList id when resolved (via AniList.idMal), else `null`. */
  malId: number | null;
  /** AniList popularity at resolve time, for tie-breaking sort. */
  anilistPopularity: number | null;
  /** AniList episode count (snapshot at resolve time). */
  anilistEpisodes: number | null;
  /** AniList startDate.year (snapshot at resolve time). */
  anilistStartYear: number | null;
  titleJa: string;
  titleCn: string;
  titleRomaji: string | null;
  titleEnglish: string | null;
  /**
   * How the AniList match was picked:
   * - `exact_native`: AniList native title equalled the Bangumi Japanese title.
   * - `top1_fallback`: no exact title match, picked the top AniList search hit.
   * - `manual`: human override.
   * - `no_match`: AniList returned zero hits.
   */
  matchType: 'exact_native' | 'top1_fallback' | 'manual' | 'no_match';
  /** Optional reviewer note (debug detail of which AniList row was picked). */
  matchNote: string | null;
  /** Resolve timestamp (epoch ms). */
  resolvedAt: number;
}

interface CrossIndexFile {
  generatedAt: number;
  source: string;
  entries: AnitabiCrossIndexEntry[];
}

const FILE = data as unknown as CrossIndexFile;

const byBangumi = new Map<number, AnitabiCrossIndexEntry>();
const byAnilist = new Map<number, AnitabiCrossIndexEntry>();
const byMal = new Map<number, AnitabiCrossIndexEntry>();

for (const entry of FILE.entries) {
  if (typeof entry.bangumiId === 'number' && entry.bangumiId > 0) {
    byBangumi.set(entry.bangumiId, entry);
  }
  if (typeof entry.anilistId === 'number' && entry.anilistId > 0) {
    byAnilist.set(entry.anilistId, entry);
  }
  if (typeof entry.malId === 'number' && entry.malId > 0) {
    byMal.set(entry.malId, entry);
  }
}

/** Generated-at timestamp of the shipped cross-index (epoch ms). */
export function getCrossIndexGeneratedAt(): number {
  return FILE.generatedAt;
}

/** Number of rows in the shipped cross-index. */
export function getCrossIndexSize(): number {
  return FILE.entries.length;
}

export function lookupByBangumiId(bangumiId: number): AnitabiCrossIndexEntry | null {
  if (!Number.isFinite(bangumiId) || bangumiId <= 0) return null;
  return byBangumi.get(bangumiId) ?? null;
}

export function lookupByAnilistId(anilistId: number): AnitabiCrossIndexEntry | null {
  if (!Number.isFinite(anilistId) || anilistId <= 0) return null;
  return byAnilist.get(anilistId) ?? null;
}

export function lookupByMalId(malId: number): AnitabiCrossIndexEntry | null {
  if (!Number.isFinite(malId) || malId <= 0) return null;
  return byMal.get(malId) ?? null;
}

/**
 * Coerce an arbitrary id (string/number) and platform to a Bangumi subject id
 * via the cross-index. Returns `null` when no entry matches or the platform
 * isn't supported by this index.
 */
export function lookupBangumiByPlatformId(
  platform: string,
  rawId: string | number
): number | null {
  const numeric = typeof rawId === 'number' ? rawId : Number(rawId);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  if (platform === 'anilist') {
    return lookupByAnilistId(numeric)?.bangumiId ?? null;
  }
  if (platform === 'myanimelist' || platform === 'mal') {
    return lookupByMalId(numeric)?.bangumiId ?? null;
  }
  return null;
}
