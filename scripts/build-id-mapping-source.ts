#!/usr/bin/env bun
/**
 * Build merged anime ID mapping source.
 *
 * Fetches Fribb (anime-list-mini.json) + manami-project (anime-offline-database-minified.json),
 * regex-extracts platform IDs from manami's sources[] URLs, and outer-joins both
 * on AniDB ID. Fribb values win where they exist; manami fills the gaps —
 * especially Bangumi, which Fribb doesn't carry.
 *
 * Output: anime-id-mappings-merged.json (minified) in CWD.
 *
 * Run locally:   bun scripts/build-id-mapping-source.ts
 * Run in CI:     see .github/workflows/build-id-mapping.yml
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';

const FRIBB_URL =
  'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-mini.json';
const MANAMI_URL =
  'https://raw.githubusercontent.com/manami-project/anime-offline-database/master/anime-offline-database-minified.json';

const OUTPUT = 'anime-id-mappings-merged.json';

// All platform-ID columns we care about. anidb_id is the join key but is
// also kept on the merged record for future re-joins.
const ID_COLUMNS = [
  'mal_id',
  'anilist_id',
  'kitsu_id',
  'bangumi_id',
  'shikimori_id',
  'simkl_id',
  'annict_id',
  'anidb_id',
  'thetvdb_id',
  'themoviedb_id',
  'livechart_id',
  'anime_planet_id',
  'anisearch_id',
  'notify_moe_id',
] as const;

type IdColumn = (typeof ID_COLUMNS)[number];

type MergedRecord = Partial<Record<IdColumn, number | string>>;

interface FribbEntry {
  mal_id?: number;
  anilist_id?: number;
  kitsu_id?: number;
  anidb_id?: number;
  shikimori_id?: number;
  simkl_id?: number;
  annict_id?: number;
  thetvdb_id?: number;
  themoviedb_id?: number;
  livechart_id?: number;
  'anime-planet_id'?: string;
  anisearch_id?: number;
  'notify.moe_id'?: string;
  type?: string;
}

interface ManamiEntry {
  sources?: string[];
  title?: string;
}

interface ManamiFile {
  data?: ManamiEntry[];
}

const SOURCE_PATTERNS: Array<{
  re: RegExp;
  col: IdColumn;
  numeric: boolean;
}> = [
  { re: /bangumi\.tv\/subject\/(\d+)/i, col: 'bangumi_id', numeric: true },
  { re: /anilist\.co\/anime\/(\d+)/i, col: 'anilist_id', numeric: true },
  { re: /myanimelist\.net\/anime\/(\d+)/i, col: 'mal_id', numeric: true },
  { re: /anidb\.net\/anime\/(\d+)/i, col: 'anidb_id', numeric: true },
  { re: /kitsu\.io\/anime\/(\d+)/i, col: 'kitsu_id', numeric: true },
  { re: /shikimori\.one\/animes\/(\d+)/i, col: 'shikimori_id', numeric: true },
  { re: /simkl\.com\/anime\/(\d+)/i, col: 'simkl_id', numeric: true },
  { re: /livechart\.me\/anime\/(\d+)/i, col: 'livechart_id', numeric: true },
  { re: /notify\.moe\/anime\/(\S+)/i, col: 'notify_moe_id', numeric: false },
];

async function fetchJson<T>(url: string): Promise<T> {
  console.log(`[build-id-mapping] GET ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

function extractIdsFromManami(entry: ManamiEntry): MergedRecord {
  const out: MergedRecord = {};
  for (const url of entry.sources ?? []) {
    for (const { re, col, numeric } of SOURCE_PATTERNS) {
      if (out[col] !== undefined) continue;
      const m = url.match(re);
      if (!m) continue;
      out[col] = numeric ? Number(m[1]) : m[1];
    }
  }
  return out;
}

function normalizeFribbEntry(e: FribbEntry): MergedRecord {
  const out: MergedRecord = {};
  if (typeof e.mal_id === 'number') out.mal_id = e.mal_id;
  if (typeof e.anilist_id === 'number') out.anilist_id = e.anilist_id;
  if (typeof e.kitsu_id === 'number') out.kitsu_id = e.kitsu_id;
  if (typeof e.anidb_id === 'number') out.anidb_id = e.anidb_id;
  if (typeof e.shikimori_id === 'number') out.shikimori_id = e.shikimori_id;
  if (typeof e.simkl_id === 'number') out.simkl_id = e.simkl_id;
  if (typeof e.annict_id === 'number') out.annict_id = e.annict_id;
  if (typeof e.thetvdb_id === 'number') out.thetvdb_id = e.thetvdb_id;
  if (typeof e.themoviedb_id === 'number') out.themoviedb_id = e.themoviedb_id;
  if (typeof e.livechart_id === 'number') out.livechart_id = e.livechart_id;
  if (typeof e['anime-planet_id'] === 'string')
    out.anime_planet_id = e['anime-planet_id'];
  if (typeof e.anisearch_id === 'number') out.anisearch_id = e.anisearch_id;
  if (typeof e['notify.moe_id'] === 'string') out.notify_moe_id = e['notify.moe_id'];
  return out;
}

function mergeInto(dst: MergedRecord, src: MergedRecord): void {
  for (const col of ID_COLUMNS) {
    if (dst[col] === undefined && src[col] !== undefined) {
      dst[col] = src[col];
    }
  }
}

function dedupeByPriority(records: MergedRecord[]): MergedRecord[] {
  // Outer-join key is anidb_id. Records without anidb_id are kept as singletons
  // (they cannot be joined, but still carry useful IDs we want to ship).
  const byAnidb = new Map<number, MergedRecord>();
  const orphans: MergedRecord[] = [];

  for (const r of records) {
    const key = r.anidb_id;
    if (typeof key === 'number') {
      const existing = byAnidb.get(key);
      if (existing) {
        mergeInto(existing, r);
      } else {
        byAnidb.set(key, { ...r });
      }
    } else {
      // Keep but cannot be merged with manami via the join key.
      orphans.push({ ...r });
    }
  }
  return [...byAnidb.values(), ...orphans];
}

function reportCoverage(records: MergedRecord[]): void {
  const total = records.length;
  console.log(`\n=== Coverage report (${total} records) ===`);
  for (const col of ID_COLUMNS) {
    let present = 0;
    for (const r of records) {
      if (r[col] !== undefined && r[col] !== null) present++;
    }
    const pct = total > 0 ? ((present / total) * 100).toFixed(2) : '0.00';
    console.log(`  ${col.padEnd(18)} ${present.toString().padStart(7)} / ${total} (${pct}%)`);
  }
}

async function main() {
  const [fribbRaw, manamiRaw] = await Promise.all([
    fetchJson<FribbEntry[]>(FRIBB_URL),
    fetchJson<ManamiFile>(MANAMI_URL),
  ]);

  console.log(`[build-id-mapping] Fribb entries: ${fribbRaw.length}`);
  console.log(`[build-id-mapping] Manami entries: ${manamiRaw.data?.length ?? 0}`);

  const fribbRecords = fribbRaw.map(normalizeFribbEntry);
  const manamiRecords = (manamiRaw.data ?? []).map(extractIdsFromManami);

  // Order matters: Fribb first → its values win when both sides define a field.
  const merged = dedupeByPriority([...fribbRecords, ...manamiRecords]);

  reportCoverage(merged);

  const outPath = resolve(process.cwd(), OUTPUT);
  writeFileSync(outPath, JSON.stringify(merged));
  console.log(`\n[build-id-mapping] Wrote ${merged.length} records → ${outPath}`);
}

main().catch((err) => {
  console.error('[build-id-mapping] FATAL', err);
  process.exit(1);
});
