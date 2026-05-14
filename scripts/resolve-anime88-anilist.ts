#!/usr/bin/env bun
// Resolve AniList ids and popularity for each unique Bangumi anime in the
// Anime Tourism 88 dataset.
//
// Why this script exists separately from the dataset builder: AniList only
// indexes a subset of titles, has its own rate limits, and the mapping
// occasionally needs human review (old tokusatsu, romanization variants).
// Keeping it as a second pass lets us regenerate the 88 dataset (scrape +
// Bangumi resolve) without re-hitting AniList every time.
//
// Reads:  libs/services/pilgrimage/anime-tourism-88.data.json
// Writes: same file, with externalIds.anilist + anilistPopularity filled in.
//
// Rate: AniList allows 90 req/min unauthenticated; we use ~1 req/sec to leave
// headroom and avoid 429s.

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dir, '..');
const DATA_PATH = resolve(ROOT, 'libs/services/pilgrimage/anime-tourism-88.data.json');

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
const DELAY_MS = Number(process.env.ANILIST_DELAY_MS ?? '1100');
const FORCE = process.argv.includes('--force');

// Bangumi ids manually pointed at Anitabi-rich canonical subjects in
// build-anime-tourism-88.ts. Resolve AniList by ID for those rows so --force
// does not drift them back to the exact sequel/movie title.
const ANILIST_OVERRIDES: Record<number, { anilistId: number; reason: string }> = {
  265: { anilistId: 30, reason: 'manual_anitabi_prefer_main_series' },
  289: { anilistId: 934, reason: 'manual_anitabi_prefer_main_series' },
  40310: { anilistId: 14131, reason: 'manual_anitabi_prefer_main_series' },
  110467: { anilistId: 20812, reason: 'manual_anitabi_prefer_main_series' },
  148099: { anilistId: 21403, reason: 'manual_exact_subject' },
};

interface Entry {
  id: number;
  year: number;
  titleJa: string;
  titleEn: string;
  region: string;
  prefecture: string;
  city: string;
  regionEn: string;
  externalIds: {
    bangumi: number | null;
    anilist: number | null;
    mal: number | null;
  };
  anilistPopularity?: number | null;
  anilistMeanScore?: number | null;
  anilistReviewNote?: string;
}

interface DataFile {
  generatedAt: string;
  resolvedAt?: string;
  source: string;
  year: number;
  count: number;
  entries: Entry[];
  anilistResolvedAt?: string;
}

interface AniListSearchHit {
  id: number;
  idMal: number | null;
  title: { romaji: string | null; english: string | null; native: string | null };
  popularity: number | null;
  meanScore: number | null;
  startDate: { year: number | null } | null;
  format: string | null;
}

const SEARCH_QUERY = `
  query ($search: String!) {
    Page(page: 1, perPage: 5) {
      media(search: $search, type: ANIME, sort: [SEARCH_MATCH]) {
        id
        idMal
        title { romaji english native }
        popularity
        meanScore
        startDate { year }
        format
      }
    }
  }
`;

const ID_QUERY = `
  query ($id: Int!) {
    Media(id: $id, type: ANIME) {
      id
      idMal
      title { romaji english native }
      popularity
      meanScore
      startDate { year }
      format
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

async function searchAniList(keyword: string): Promise<AniListSearchHit[]> {
  const res = await fetch(ANILIST_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: SEARCH_QUERY, variables: { search: keyword } }),
  });
  if (!res.ok) {
    throw new Error(`AniList HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const json = (await res.json()) as {
    data?: { Page: { media: AniListSearchHit[] } };
    errors?: unknown;
  };
  if (json.errors) {
    throw new Error(`AniList GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data?.Page.media ?? [];
}

async function getAniListById(id: number): Promise<AniListSearchHit | null> {
  const res = await fetch(ANILIST_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: ID_QUERY, variables: { id } }),
  });
  if (!res.ok) {
    throw new Error(`AniList HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const json = (await res.json()) as {
    data?: { Media: AniListSearchHit | null };
    errors?: unknown;
  };
  if (json.errors) {
    throw new Error(`AniList GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data?.Media ?? null;
}

interface MatchPick {
  hit: AniListSearchHit | null;
  reason: string;
}

function pickMatch(titleJa: string, titleEn: string, hits: AniListSearchHit[]): MatchPick {
  if (hits.length === 0) return { hit: null, reason: 'no_results' };
  const targetJa = normalize(titleJa);
  const targetEn = normalize(titleEn);

  for (const h of hits) {
    if (normalize(h.title.native) === targetJa) return { hit: h, reason: 'exact_native' };
    if (normalize(h.title.romaji) === targetJa) return { hit: h, reason: 'exact_romaji_ja' };
  }
  for (const h of hits) {
    if (normalize(h.title.english) === targetEn) return { hit: h, reason: 'exact_english' };
    if (normalize(h.title.romaji) === targetEn) return { hit: h, reason: 'exact_romaji_en' };
  }
  for (const h of hits) {
    const native = normalize(h.title.native);
    if (native && (native.includes(targetJa) || targetJa.includes(native))) {
      if (Math.abs(native.length - targetJa.length) <= 3) {
        return { hit: h, reason: 'substring_native' };
      }
    }
  }
  return { hit: hits[0], reason: 'top1_fallback' };
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

function applyAniListHit(targets: Entry[], hit: AniListSearchHit, reason: string): void {
  const needsReviewFlag =
    reason === 'top1_fallback' || reason === 'substring_native' || reason.startsWith('manual_');
  for (const e of targets) {
    e.externalIds.anilist = hit.id;
    e.externalIds.mal = hit.idMal ?? null;
    e.anilistPopularity = hit.popularity ?? null;
    e.anilistMeanScore = hit.meanScore ?? null;
    if (needsReviewFlag) {
      e.anilistReviewNote = `match=${reason}; anilist=${JSON.stringify(hit.title)}`;
    } else {
      delete e.anilistReviewNote;
    }
  }
}

async function main(): Promise<void> {
  const data: DataFile = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  const entries = data.entries;

  const byBangumi = new Map<number, Entry[]>();
  for (const e of entries) {
    const bid = e.externalIds.bangumi;
    if (typeof bid !== 'number') continue;
    const list = byBangumi.get(bid) ?? [];
    list.push(e);
    byBangumi.set(bid, list);
  }

  const todo: Array<{ bangumiId: number; rep: Entry }> = [];
  for (const [bid, list] of byBangumi.entries()) {
    if (!FORCE && list.every((e) => typeof e.externalIds.anilist === 'number')) continue;
    todo.push({ bangumiId: bid, rep: list[0] });
  }
  console.log(
    `[anilist-resolve] ${todo.length} bangumi ids to resolve (force=${FORCE}, delay=${DELAY_MS}ms)`
  );

  let resolved = 0;
  let needsReview = 0;
  const failures: Array<{ bangumiId: number; titleJa: string; reason: string }> = [];

  for (let i = 0; i < todo.length; i++) {
    const { bangumiId, rep } = todo[i];
    const targets = byBangumi.get(bangumiId) ?? [];
    const override = ANILIST_OVERRIDES[bangumiId];
    if (override) {
      process.stdout.write(
        `[${i + 1}/${todo.length}] bgm#${bangumiId} anilist#${override.anilistId} manual ... `
      );
      try {
        const hit = await getAniListById(override.anilistId);
        if (hit) {
          applyAniListHit(targets, hit, override.reason);
          console.log(
            `OK anilist#${hit.id} (${override.reason}, pop=${hit.popularity ?? '-'}, score=${hit.meanScore ?? '-'})`
          );
          resolved++;
          needsReview++;
        } else {
          console.log('MISS manual_id_not_found');
          failures.push({ bangumiId, titleJa: rep.titleJa, reason: 'manual_id_not_found' });
        }
      } catch (err) {
        console.log(`ERR ${(err as Error).message}`);
        failures.push({ bangumiId, titleJa: rep.titleJa, reason: 'http_error' });
      }
      await delay(DELAY_MS);
      continue;
    }
    const query = cleanQuery(rep.titleJa) || rep.titleJa;
    process.stdout.write(
      `[${i + 1}/${todo.length}] bgm#${bangumiId} q=${JSON.stringify(query)} ... `
    );
    let hits: AniListSearchHit[];
    try {
      hits = await searchAniList(query);
    } catch (err) {
      console.log(`ERR ${(err as Error).message}`);
      failures.push({ bangumiId, titleJa: rep.titleJa, reason: 'http_error' });
      await delay(DELAY_MS);
      continue;
    }

    const { hit, reason } = pickMatch(rep.titleJa, rep.titleEn, hits);
    if (hit) {
      const needsReviewFlag = reason === 'top1_fallback' || reason === 'substring_native';
      applyAniListHit(targets, hit, reason);
      console.log(
        `OK anilist#${hit.id} (${reason}, pop=${hit.popularity ?? '-'}, score=${hit.meanScore ?? '-'})`
      );
      resolved++;
      if (needsReviewFlag) needsReview++;
    } else {
      console.log(`MISS ${reason}`);
      failures.push({ bangumiId, titleJa: rep.titleJa, reason });
      for (const e of targets) {
        e.externalIds.anilist = null;
        e.anilistPopularity = null;
        e.anilistMeanScore = null;
        e.anilistReviewNote = `unresolved:${reason}`;
      }
    }
    await delay(DELAY_MS);
  }

  data.anilistResolvedAt = new Date().toISOString();
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');

  const totalWithAnilist = entries.filter((e) => typeof e.externalIds.anilist === 'number').length;
  console.log(
    `\n[anilist-resolve] done. ${resolved}/${todo.length} unique anime newly resolved.\n` +
      `  needs review: ${needsReview}\n` +
      `  failures: ${failures.length}\n` +
      `  dataset entries with anilist id: ${totalWithAnilist}/${entries.length}`
  );
  if (failures.length) {
    console.log('  failure detail:');
    for (const f of failures) {
      console.log(`    bgm#${f.bangumiId} ja=${JSON.stringify(f.titleJa)} reason=${f.reason}`);
    }
  }
}

main().catch((err: unknown) => {
  console.error('[anilist-resolve] failed:', err);
  process.exit(1);
});
