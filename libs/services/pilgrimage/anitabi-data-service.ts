// Runtime hydration for the bundled L2 anitabi-index and L3
// anitabi-cross-index data files.
//
// The bundled JSONs ship with a small fallback seed so the app works on a
// fresh install with no network. Once the device is online, this service:
//
//   1. Reads the cached file from disk if present and younger than
//      FRESHNESS_WINDOW_MS — parses + hands to the matching module's
//      `hydrateFromRuntime`.
//   2. Otherwise downloads the latest release-asset from Aniseekr-source,
//      writes it to the FileSystem cache, then hydrates.
//
// Both data sets ship JSON Schemas alongside the asset (linked from the
// payload's `$schema` field). We don't validate at runtime — the build
// pipeline does that — but consumers can fetch the schema URL to validate
// independently.

import * as FileSystem from 'expo-file-system';

import {
  hydrateFromRuntime as hydrateAnitabiIndex,
  type AnitabiIndexEntry,
} from './anitabi-index';
import {
  hydrateFromRuntime as hydrateAnitabiCrossIndex,
  type AnitabiCrossIndexEntry,
} from './anitabi-cross-index';

interface AnitabiIndexFile {
  generatedAt: number;
  source: string;
  fallbackUsed?: boolean;
  entries: AnitabiIndexEntry[];
}

interface AnitabiCrossIndexFile {
  generatedAt: number;
  source: string;
  seedSize?: number;
  entries: AnitabiCrossIndexEntry[];
}

const ANITABI_INDEX_URL =
  'https://github.com/Aniseekr/Aniseekr-source/releases/download/anitabi-index/anitabi-index.json';
const ANITABI_CROSS_INDEX_URL =
  'https://github.com/Aniseekr/Aniseekr-source/releases/download/anitabi-cross-index/anitabi-cross-index.json';

const ANITABI_INDEX_FILENAME = 'anitabi-index.runtime.json';
const ANITABI_CROSS_INDEX_FILENAME = 'anitabi-cross-index.runtime.json';

/**
 * How long an on-disk runtime payload is considered fresh. Both data sets
 * are rebuilt daily by Aniseekr-source CI, but the device copy doesn't need
 * to track that closely — coverage doesn't move much day-to-day. 7 days
 * means each device pulls each asset roughly weekly.
 */
const FRESHNESS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type FsLike = {
  cacheDirectory?: string;
  downloadAsync(url: string, dest: string): Promise<{ status: number }>;
  readAsStringAsync(path: string): Promise<string>;
  getInfoAsync(path: string): Promise<{ exists: boolean; modificationTime?: number }>;
};

const fs = FileSystem as unknown as FsLike;

function cachePath(filename: string): string | null {
  const dir = fs.cacheDirectory;
  if (!dir) return null;
  return dir + filename;
}

async function isFresh(path: string): Promise<boolean> {
  try {
    const info = await fs.getInfoAsync(path);
    if (!info.exists) return false;
    const mtimeSec = info.modificationTime ?? 0;
    if (mtimeSec <= 0) return false;
    const mtimeMs = mtimeSec * 1000;
    return Date.now() - mtimeMs < FRESHNESS_WINDOW_MS;
  } catch {
    return false;
  }
}

async function fetchAndCache<T>(url: string, destPath: string): Promise<T | null> {
  try {
    const res = await fs.downloadAsync(url, destPath);
    if (res.status !== 200) {
      console.warn(`[anitabi-data-service] download ${url} → ${res.status}`);
      return null;
    }
    const body = await fs.readAsStringAsync(destPath);
    return JSON.parse(body) as T;
  } catch (err) {
    console.warn(`[anitabi-data-service] fetch failed for ${url}:`, err);
    return null;
  }
}

async function readCached<T>(path: string): Promise<T | null> {
  try {
    const body = await fs.readAsStringAsync(path);
    return JSON.parse(body) as T;
  } catch (err) {
    console.warn(`[anitabi-data-service] cache read failed for ${path}:`, err);
    return null;
  }
}

async function loadFile<T>(url: string, filename: string): Promise<T | null> {
  const path = cachePath(filename);
  if (!path) return null;
  if (await isFresh(path)) {
    const cached = await readCached<T>(path);
    if (cached) return cached;
  }
  return fetchAndCache<T>(url, path);
}

/**
 * Refresh both pilgrimage data files from the Aniseekr-source release assets.
 * Safe to call on every cold launch — short-circuits when the device's cached
 * copies are still fresh. Failures are swallowed (logged), since the bundled
 * fallback keeps the feature working.
 *
 * The two fetches run in parallel. Order of completion doesn't matter: both
 * modules use mutable in-memory maps, so swapping payloads is atomic per
 * module.
 */
export async function hydrateAllPilgrimageData(): Promise<void> {
  await Promise.all([
    loadFile<AnitabiIndexFile>(ANITABI_INDEX_URL, ANITABI_INDEX_FILENAME).then((f) => {
      if (f && Array.isArray(f.entries) && f.entries.length > 0) {
        hydrateAnitabiIndex(f);
      }
    }),
    loadFile<AnitabiCrossIndexFile>(ANITABI_CROSS_INDEX_URL, ANITABI_CROSS_INDEX_FILENAME).then((f) => {
      if (f && Array.isArray(f.entries) && f.entries.length > 0) {
        hydrateAnitabiCrossIndex(f);
      }
    }),
  ]);
}
