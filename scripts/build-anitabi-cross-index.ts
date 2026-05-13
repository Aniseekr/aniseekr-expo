#!/usr/bin/env bun
// Build the L2 cross-index that maps every Anitabi (Bangumi-keyed) entry to
// its AniList + MyAnimeList ids. Consumed at runtime by
// libs/services/pilgrimage/anitabi-cross-index.ts.
//
// Inputs:
//   - libs/services/pilgrimage/anitabi-index.data.json        (1072 seeds)
//   - libs/services/pilgrimage/anime-tourism-88.data.json     (124 row cache to reuse)
//   - libs/services/pilgrimage/anitabi-cross-index.data.json  (existing rows; incremental)
//
// Output:
//   - libs/services/pilgrimage/anitabi-cross-index.data.json  (rewritten)
//
// Rate: AniList allows 90 req/min unauthenticated. We use ~1 req/sec
// (DELAY_MS = 1100) to leave headroom and avoid 429s.
//
// Flags:
//   --force      Refetch every seed, ignoring the cached cross-index rows.
//
// Usage:
//   bun run scripts/build-anitabi-cross-index.ts
//   bun run scripts/build-anitabi-cross-index.ts --force

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dir, '..');
const ANITABI_INDEX_PATH = resolve(
  ROOT,
  'libs/services/pilgrimage/anitabi-index.data.json'
);
const ANIME88_PATH = resolve(
  ROOT,
  'libs/services/pilgrimage/anime-tourism-88.data.json'
);
const OUTPUT_PATH = resolve(
  ROOT,
  'libs/services/pilgrimage/anitabi-cross-index.data.json'
);

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
const ANILIST_DELAY_MS = Number(process.env.ANILIST_DELAY_MS ?? '1100');
const FORCE = process.argv.includes('--force');

interface AnitabiIndexRow {
  id: number;
  title: string;
  cn: string;
  episodes?: number | null;
  startYear?: number | null;
}

interface AnitabiIndexFile {
  generatedAt: number;
  source: string;
  entries: AnitabiIndexRow[];
}

interface Anime88Row {
  externalIds: {
    bangumi: number | null;
    anilist: number | null;
    mal: number | null;
  };
  anilistPopularity?: number | null;
  titleJa: string;
  titleEn: string;
}

interface Anime88File {
  entries: Anime88Row[];
}

type MatchType = 'exact_native' | 'top1_fallback' | 'manual' | 'no_match';

interface CrossIndexEntry {
  bangumiId: number;
  anilistId: number | null;
  malId: number | null;
  anilistPopularity: number | null;
  anilistEpisodes: number | null;
  anilistStartYear: number | null;
  titleJa: string;
  titleCn: string;
  titleRomaji: string | null;
  titleEnglish: string | null;
  matchType: MatchType;
  matchNote: string | null;
  resolvedAt: number;
}

interface CrossIndexFile {
  generatedAt: number;
  source: string;
  entries: CrossIndexEntry[];
}

interface AniListHit {
  id: number;
  idMal: number | null;
  popularity: number | null;
  episodes: number | null;
  startDate: { year: number | null } | null;
  title: { romaji: string | null; english: string | null; native: string | null };
}

const SEARCH_QUERY = `
  query ($search: String) {
    Page(perPage: 5) {
      media(search: $search, type: ANIME) {
        id
        idMal
        popularity
        episodes
        startDate { year }
        title { romaji english native }
      }
    }
  }
`;

function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/[！]/g, '!')
    .replace(/[？]/g, '?')
    .replace(/[『』「」]/g, '')
    .replace(/[\s\-–—・　]+/g, '')
    .toLowerCase()
    .trim();
}

function cleanQuery(title: string): string {
  return title
    .replace(/[『』]/g, '')
    .replace(/シリーズ$/, '')
    .replace(/^劇場版/, '')
    .replace(/^映画/, '')
    .replace(/\([^)]*\)$/, '')
    .replace(/（[^）]*）$/, '')
    .trim();
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

async function searchAniList(keyword: string): Promise<AniListHit[]> {
  const res = await fetch(ANILIST_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: SEARCH_QUERY, variables: { search: keyword } }),
  });
  if (!res.ok) {
    throw new Error(`AniList HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const json = (await res.json()) as { data?: { Page: { media: AniListHit[] } }; errors?: unknown };
  if (json.errors) {
    throw new Error(`AniList GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data?.Page.media ?? [];
}

interface DisambiguationInputs {
  titleJa: string;
  anitabiEpisodes: number | null;
  anitabiStartYear: number | null;
}

interface MatchPick {
  hit: AniListHit | null;
  type: MatchType;
  note: string | null;
}

/**
 * Disambiguate among up to 5 AniList candidates:
 *   1. Prefer rows whose `title.native` equals the Bangumi Japanese title.
 *   2. Among ties, pick the one with the smallest combined diff in
 *      `episodes` and `startDate.year` vs the Anitabi index columns.
 *   3. If 0 candidates remain, mark `top1_fallback` (top search hit).
 */
function pickMatch(inputs: DisambiguationInputs, hits: AniListHit[]): MatchPick {
  if (hits.length === 0) {
    return { hit: null, type: 'no_match', note: 'no_results' };
  }

  const targetJa = normalize(inputs.titleJa);
  const exact = hits.filter((h) => normalize(h.title.native) === targetJa);

  if (exact.length === 1) {
    return { hit: exact[0], type: 'exact_native', note: 'unique_native' };
  }

  if (exact.length > 1) {
    const ranked = [...exact].sort(
      (a, b) =>
        scoreByMeta(a, inputs) - scoreByMeta(b, inputs) ||
        (b.popularity ?? 0) - (a.popularity ?? 0)
    );
    return {
      hit: ranked[0],
      type: 'exact_native',
      note: `disambiguated_${exact.length}_by_meta`,
    };
  }

  return {
    hit: hits[0],
    type: 'top1_fallback',
    note: `top1_of_${hits.length}`,
  };
}

/**
 * Lower is better. Each missing metric contributes a constant penalty so
 * candidates with full metadata win ties over candidates with neither field.
 */
function scoreByMeta(hit: AniListHit, inputs: DisambiguationInputs): number {
  const MISSING_PENALTY = 100;
  let score = 0;

  if (inputs.anitabiEpisodes != null) {
    if (typeof hit.episodes === 'number') {
      score += Math.abs(hit.episodes - inputs.anitabiEpisodes);
    } else {
      score += MISSING_PENALTY;
    }
  }

  if (inputs.anitabiStartYear != null) {
    const year = hit.startDate?.year ?? null;
    if (typeof year === 'number') {
      score += Math.abs(year - inputs.anitabiStartYear);
    } else {
      score += MISSING_PENALTY;
    }
  }

  return score;
}

interface ReusableHit {
  anilistId: number | null;
  malId: number | null;
  anilistPopularity: number | null;
}

/**
 * Build a Bangumi → reusable (anilist, mal, popularity) map from the
 * already-resolved Anime Tourism 88 dataset. Lets us skip ~124 AniList
 * requests on first-run.
 */
function buildAnime88Cache(file: Anime88File | null): Map<number, ReusableHit> {
  const out = new Map<number, ReusableHit>();
  if (!file) return out;
  for (const row of file.entries) {
    const bid = row.externalIds.bangumi;
    if (typeof bid !== 'number' || bid <= 0) continue;
    if (out.has(bid)) continue;
    out.set(bid, {
      anilistId: row.externalIds.anilist ?? null,
      malId: row.externalIds.mal ?? null,
      anilistPopularity: row.anilistPopularity ?? null,
    });
  }
  return out;
}

function loadExisting(): Map<number, CrossIndexEntry> {
  const map = new Map<number, CrossIndexEntry>();
  if (!existsSync(OUTPUT_PATH)) return map;
  try {
    const raw = readFileSync(OUTPUT_PATH, 'utf8');
    const parsed = JSON.parse(raw) as CrossIndexFile;
    if (!Array.isArray(parsed.entries)) return map;
    for (const entry of parsed.entries) {
      if (typeof entry.bangumiId === 'number' && entry.bangumiId > 0) {
        map.set(entry.bangumiId, entry);
      }
    }
  } catch (err) {
    console.warn('[cross-index] could not parse existing output, rebuilding:', err);
  }
  return map;
}

async function main(): Promise<void> {
  const anitabiIndex = JSON.parse(readFileSync(ANITABI_INDEX_PATH, 'utf8')) as AnitabiIndexFile;
  const anime88Raw = existsSync(ANIME88_PATH)
    ? (JSON.parse(readFileSync(ANIME88_PATH, 'utf8')) as Anime88File)
    : null;

  const seeds = anitabiIndex.entries;
  const reusable = buildAnime88Cache(anime88Raw);
  const existing = FORCE ? new Map<number, CrossIndexEntry>() : loadExisting();

  console.log(
    `[cross-index] ${seeds.length} seeds, ${existing.size} cached, ${reusable.size} reusable from anime-tourism-88 (force=${FORCE})`
  );

  const out: CrossIndexEntry[] = [];
  let reusedCount = 0;
  let cachedCount = 0;
  let resolvedCount = 0;
  let missCount = 0;

  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i];

    // 1. Reuse a previously-built row when present and not a hard miss.
    const cached = existing.get(seed.id);
    if (cached && cached.matchType !== 'no_match' && !FORCE) {
      out.push(cached);
      cachedCount++;
      continue;
    }

    // 2. Reuse the 124-row Anime Tourism 88 cache before hitting AniList.
    const reuse = reusable.get(seed.id);
    if (reuse && (reuse.anilistId !== null || reuse.malId !== null) && !FORCE) {
      out.push({
        bangumiId: seed.id,
        anilistId: reuse.anilistId,
        malId: reuse.malId,
        anilistPopularity: reuse.anilistPopularity,
        anilistEpisodes: null,
        anilistStartYear: null,
        titleJa: seed.title,
        titleCn: seed.cn,
        titleRomaji: null,
        titleEnglish: null,
        matchType: 'exact_native',
        matchNote: 'reused_from_anime_tourism_88',
        resolvedAt: Date.now(),
      });
      reusedCount++;
      continue;
    }

    // 3. Hit AniList.
    const query = cleanQuery(seed.title) || seed.title;
    process.stdout.write(
      `[${i + 1}/${seeds.length}] bgm#${seed.id} q=${JSON.stringify(query)} ... `
    );
    let hits: AniListHit[];
    try {
      hits = await searchAniList(query);
    } catch (err) {
      console.log(`ERR ${(err as Error).message}`);
      out.push({
        bangumiId: seed.id,
        anilistId: null,
        malId: null,
        anilistPopularity: null,
        anilistEpisodes: null,
        anilistStartYear: null,
        titleJa: seed.title,
        titleCn: seed.cn,
        titleRomaji: null,
        titleEnglish: null,
        matchType: 'no_match',
        matchNote: `http_error:${(err as Error).message}`,
        resolvedAt: Date.now(),
      });
      missCount++;
      await delay(ANILIST_DELAY_MS);
      continue;
    }

    const pick = pickMatch(
      {
        titleJa: seed.title,
        anitabiEpisodes: seed.episodes ?? null,
        anitabiStartYear: seed.startYear ?? null,
      },
      hits
    );

    if (pick.hit) {
      out.push({
        bangumiId: seed.id,
        anilistId: pick.hit.id,
        malId: pick.hit.idMal,
        anilistPopularity: pick.hit.popularity,
        anilistEpisodes: pick.hit.episodes,
        anilistStartYear: pick.hit.startDate?.year ?? null,
        titleJa: seed.title,
        titleCn: seed.cn,
        titleRomaji: pick.hit.title.romaji,
        titleEnglish: pick.hit.title.english,
        matchType: pick.type,
        matchNote: pick.note,
        resolvedAt: Date.now(),
      });
      console.log(`OK anilist#${pick.hit.id} (${pick.type})`);
      resolvedCount++;
    } else {
      out.push({
        bangumiId: seed.id,
        anilistId: null,
        malId: null,
        anilistPopularity: null,
        anilistEpisodes: null,
        anilistStartYear: null,
        titleJa: seed.title,
        titleCn: seed.cn,
        titleRomaji: null,
        titleEnglish: null,
        matchType: 'no_match',
        matchNote: pick.note,
        resolvedAt: Date.now(),
      });
      console.log(`MISS ${pick.note ?? 'no_match'}`);
      missCount++;
    }

    await delay(ANILIST_DELAY_MS);
  }

  // Deterministic sort: by bangumi id so diffs are tight.
  out.sort((a, b) => a.bangumiId - b.bangumiId);

  const file: CrossIndexFile = {
    generatedAt: Date.now(),
    source: 'scripts/build-anitabi-cross-index.ts',
    entries: out,
  };
  writeFileSync(OUTPUT_PATH, JSON.stringify(file, null, 2) + '\n', 'utf8');

  console.log(
    `\n[cross-index] wrote ${out.length} entries to ${OUTPUT_PATH}\n` +
      `  cached:   ${cachedCount}\n` +
      `  reused:   ${reusedCount} (from anime-tourism-88)\n` +
      `  resolved: ${resolvedCount} (new AniList hits)\n` +
      `  missed:   ${missCount}`
  );
}

main().catch((err: unknown) => {
  console.error('[cross-index] failed:', err);
  process.exit(1);
});
