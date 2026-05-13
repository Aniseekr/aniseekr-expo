#!/usr/bin/env bun
// Build the offline Anitabi anime-centres index consumed at runtime by
// libs/services/pilgrimage/anitabi-index.ts.
//
// For each Bangumi subject id in FEATURED_PILGRIMAGE_ANIME (plus any extra ids
// passed via env), call the public `GET https://api.anitabi.cn/bangumi/{id}/lite`
// endpoint, drop entries that 404 or carry [0,0] geo, and write the result to
// libs/services/pilgrimage/anitabi-index.data.json.
//
// This script uses ONLY the documented public Anitabi endpoint
// (see https://github.com/anitabi/anitabi.cn-document/blob/main/api.md).
// It is rate-aware (configurable concurrency + delay) so reruns stay friendly
// to api.anitabi.cn.
//
// Usage:
//   bun run scripts/build-anitabi-index.ts
//   bun run scripts/build-anitabi-index.ts --extra 12345,67890
//   ANITABI_CONCURRENCY=2 bun run scripts/build-anitabi-index.ts

import { writeFileSync } from 'fs';
import { resolve } from 'path';

import { AnitabiClient } from '../libs/clients/anitabi-client';
import { FEATURED_PILGRIMAGE_ANIME } from '../libs/services/pilgrimage/featured-anime';
import type { AnitabiBangumi } from '../libs/services/pilgrimage/types';

const ROOT = resolve(import.meta.dir, '..');
const OUTPUT_PATH = resolve(
  ROOT,
  'libs/services/pilgrimage/anitabi-index.data.json'
);

const CONCURRENCY = Number(process.env.ANITABI_CONCURRENCY ?? '3');
const DELAY_MS = Number(process.env.ANITABI_DELAY_MS ?? '120');

interface IndexEntry {
  id: number;
  title: string;
  cn: string;
  city: string;
  cover: string;
  color: string;
  lat: number;
  lng: number;
  zoom: number;
  pointsLength: number;
  builtAt: number;
}

function parseExtraIds(): number[] {
  const flagIdx = process.argv.indexOf('--extra');
  if (flagIdx === -1 || flagIdx === process.argv.length - 1) return [];
  return process.argv[flagIdx + 1]
    .split(/[,\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function isUsable(b: AnitabiBangumi | null): b is AnitabiBangumi {
  if (!b) return false;
  if (!Array.isArray(b.geo) || b.geo.length < 2) return false;
  const [lat, lng] = b.geo;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  if ((b.pointsLength ?? 0) <= 0) return false;
  return true;
}

function toEntry(b: AnitabiBangumi, builtAt: number): IndexEntry {
  return {
    id: b.id,
    title: b.title ?? '',
    cn: b.cn ?? '',
    city: b.city ?? '',
    cover: b.cover ?? '',
    color: b.color ?? '',
    lat: round6(b.geo[0]),
    lng: round6(b.geo[1]),
    zoom: round1(b.zoom ?? 0),
    pointsLength: b.pointsLength ?? 0,
    builtAt,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(id: number): Promise<AnitabiBangumi | null> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await AnitabiClient.getLite(id);
    } catch (err) {
      lastErr = err;
      await delay(500 * attempt);
    }
  }
  console.warn(`[anitabi-index] giving up on ${id}:`, lastErr);
  return null;
}

async function main(): Promise<void> {
  const seedIds = [
    ...FEATURED_PILGRIMAGE_ANIME.map((a) => a.bangumiId),
    ...parseExtraIds(),
  ];
  // dedupe while keeping insertion order
  const ids = Array.from(new Set(seedIds));
  console.log(
    `[anitabi-index] fetching ${ids.length} bangumi (concurrency=${CONCURRENCY}, delay=${DELAY_MS}ms)`
  );

  const builtAt = Date.now();
  const entries: IndexEntry[] = [];
  const skipped: number[] = [];

  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < ids.length) {
      const idx = cursor++;
      const id = ids[idx];
      const lite = await fetchWithRetry(id);
      if (!isUsable(lite)) {
        skipped.push(id);
      } else {
        entries.push(toEntry(lite, builtAt));
      }
      await delay(DELAY_MS);
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, CONCURRENCY) }, () => worker())
  );

  // Stable order: by points desc, then id asc. Helpful for diffs.
  entries.sort((a, b) => b.pointsLength - a.pointsLength || a.id - b.id);

  const output = {
    generatedAt: builtAt,
    source: 'https://api.anitabi.cn/bangumi/{id}/lite',
    entries,
  };
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');

  console.log(
    `[anitabi-index] wrote ${entries.length} entries to ${OUTPUT_PATH}` +
      (skipped.length ? ` (skipped ${skipped.length}: ${skipped.join(', ')})` : '')
  );
}

main().catch((err: unknown) => {
  console.error('[anitabi-index] failed:', err);
  process.exit(1);
});
