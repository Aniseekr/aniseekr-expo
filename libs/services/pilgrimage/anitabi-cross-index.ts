// L3 cross-index: Bangumi → AniList + MyAnimeList ids so the pilgrimage
// feature can resolve `bangumiId` for users who browse with AniList or MAL
// as their source platform — without going through the slower SQLite-backed
// IDMappingService (L1).
//
// Two-tier loading:
//   1. Cold start: bundled JSON below (small fallback seed, always offline).
//   2. Runtime hydration: anitabi-data-service downloads the latest version
//      from Aniseekr-source's `anitabi-cross-index` GitHub Release alias
//      asset (built daily from L2 + AniList GraphQL) and calls
//      `hydrateFromRuntime()` to swap in the larger payload.
//
// Lookup APIs stay sync — they always read whichever file is currently
// active. Callers don't need to know whether they're seeing the bundled or
// runtime payload; the only difference is coverage.

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
  /** Optional. Present on Aniseekr-source release-asset payloads. */
  seedSize?: number;
}

let FILE: CrossIndexFile | null = null;
let byBangumi = new Map<number, AnitabiCrossIndexEntry>();
let byAnilist = new Map<number, AnitabiCrossIndexEntry>();
let byMal = new Map<number, AnitabiCrossIndexEntry>();
// True once FILE/maps reflect a real payload — either the bundled cold-start
// seed (built lazily on first query) or a runtime-hydrated payload. Guards the
// lazy fallback so a runtime hydration that lands before any query is never
// overwritten, and the 40KB bundled JSON is never parsed in that case.
let built = false;

function rebuildIndices(file: CrossIndexFile): void {
  const nextByBangumi = new Map<number, AnitabiCrossIndexEntry>();
  const nextByAnilist = new Map<number, AnitabiCrossIndexEntry>();
  const nextByMal = new Map<number, AnitabiCrossIndexEntry>();
  for (const entry of file.entries) {
    if (typeof entry.bangumiId === 'number' && entry.bangumiId > 0) {
      nextByBangumi.set(entry.bangumiId, entry);
    }
    if (typeof entry.anilistId === 'number' && entry.anilistId > 0) {
      nextByAnilist.set(entry.anilistId, entry);
    }
    if (typeof entry.malId === 'number' && entry.malId > 0) {
      nextByMal.set(entry.malId, entry);
    }
  }
  FILE = file;
  byBangumi = nextByBangumi;
  byAnilist = nextByAnilist;
  byMal = nextByMal;
  built = true;
}

/**
 * Lazy + memoized cold-start build. Parses the 40KB bundled JSON and builds
 * the lookup maps only on the FIRST query that arrives before runtime
 * hydration — deferring that parse off the module-eval JS thread. If
 * `hydrateFromRuntime` already ran, this is a no-op and the bundled JSON is
 * never required at all.
 */
function ensureBuilt(): CrossIndexFile {
  if (built && FILE) return FILE;
  // require (sync) so the public lookup APIs stay sync on first call. Bun
  // returns the parsed object directly; bun:test mock.module wraps it in
  // `{ default }`.
  const mod = require('./anitabi-cross-index.data.json');
  rebuildIndices((mod?.default ?? mod) as CrossIndexFile);
  return FILE as CrossIndexFile;
}

/**
 * Replace the in-memory cross-index with a freshly-downloaded payload. Called
 * by anitabi-data-service after `_layout.tsx` startup hydration. Existing
 * sync callers automatically see the new entries on their next call. Marks the
 * index built so the bundled cold-start fallback is never parsed afterward.
 */
export function hydrateFromRuntime(file: CrossIndexFile): void {
  if (!file || !Array.isArray(file.entries)) return;
  rebuildIndices(file);
}

export function lookupByBangumiId(bangumiId: number): AnitabiCrossIndexEntry | null {
  if (!Number.isFinite(bangumiId) || bangumiId <= 0) return null;
  ensureBuilt();
  return byBangumi.get(bangumiId) ?? null;
}

function lookupByAnilistId(anilistId: number): AnitabiCrossIndexEntry | null {
  if (!Number.isFinite(anilistId) || anilistId <= 0) return null;
  ensureBuilt();
  return byAnilist.get(anilistId) ?? null;
}

function lookupByMalId(malId: number): AnitabiCrossIndexEntry | null {
  if (!Number.isFinite(malId) || malId <= 0) return null;
  ensureBuilt();
  return byMal.get(malId) ?? null;
}

/**
 * Coerce an arbitrary id (string/number) and platform to a Bangumi subject id
 * via the cross-index. Returns `null` when no entry matches or the platform
 * isn't supported by this index.
 */
export function lookupBangumiByPlatformId(platform: string, rawId: string | number): number | null {
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
