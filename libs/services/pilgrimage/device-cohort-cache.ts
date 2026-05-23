// Persistent cache for the rear-camera cohort classification result.
//
// Why we cache: enumerating CameraDevices on Android takes ~150–500ms cold
// (CameraX has to query Camera2 characteristics for every physical lens),
// and the dial would otherwise either flash a conservative [1] strip and
// then re-layout once the cohort resolves, or block first paint behind the
// enumeration. We bridge that gap by remembering the classification from
// the previous session.
//
// What we cache: a serializable SNAPSHOT, not the live `CameraDevice`
// references (those are nitro-bound JSI objects that can't survive a
// serialise/deserialise round-trip). The snapshot carries the IDs of the
// primary / ultra-wide / telephoto devices so the next launch can rehydrate
// the cohort by looking those IDs up in the freshly enumerated device list.
//
// Invalidation:
//   * `buildNumber` mismatch → null. Any OTA / store update potentially
//     changes the OS's exposed device layout, so we discard pre-update
//     classifications even if they're still within TTL.
//   * `savedAtMs` older than `ttlMs` (default 30 days) → null. Catches
//     hardware-level changes between cold launches (firmware update,
//     accessibility setting that toggles camera availability).
//   * Corrupt / unparseable cache entry → null without throwing. A stale
//     entry must never crash the camera screen.
//
// The cache is keyed by `manufacturer:modelID:facing` so a future device
// with the same model running a different cohort layout doesn't poison
// other devices. Back and front cohorts never share storage.

import { Logger } from '../../utils/logger';
import { mmkvAsyncStorageAdapter } from '../storage/app-storage';
import type { CohortStrategy } from './device-cohort';

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// Production default is the MMKV-backed adapter. Tests pass their own in-
// memory FakeStorage through the `storage` option below.
const defaultStorage: AsyncStorageLike = mmkvAsyncStorageAdapter;

export const COHORT_CACHE_PREFIX = 'aniseekr.pilgrimage.cohort.v1';
/** 30-day TTL — comfortably longer than any plausible "I left my phone
 *  in a drawer for a few weeks" gap, short enough that a firmware update
 *  doesn't keep stale classifications around forever. */
export const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type CohortFacing = 'back' | 'front';

export interface CohortSnapshot {
  readonly strategy: CohortStrategy;
  readonly primaryDeviceId: string;
  readonly ultraWideDeviceId?: string;
  readonly telephotoDeviceId?: string;
  readonly manufacturer: string;
  readonly modelID: string;
  readonly facing: CohortFacing;
  readonly buildNumber: string;
  readonly savedAtMs: number;
}

interface ReadOptions {
  storage?: AsyncStorageLike;
  now?: () => number;
  buildNumber: string;
  ttlMs?: number;
}

interface WriteOptions {
  storage?: AsyncStorageLike;
  now?: () => number;
}

interface CohortIdentity {
  manufacturer: string;
  modelID: string;
  facing: CohortFacing;
}

export function cohortCacheKey(identity: CohortIdentity): string {
  // Lowercase the manufacturer because CameraX inconsistently capitalises
  // it (`samsung` vs `Samsung` between cold and warm enumerations on the
  // same device). modelID is kept verbatim because Samsung's `SM-G780G`
  // shape is case-sensitive.
  return [
    COHORT_CACHE_PREFIX,
    identity.manufacturer.toLowerCase(),
    identity.modelID,
    identity.facing,
  ].join(':');
}

export async function writeCohortSnapshot(
  snapshot: CohortSnapshot,
  options: WriteOptions = {}
): Promise<void> {
  const storage = options.storage ?? defaultStorage;
  const key = cohortCacheKey(snapshot);
  try {
    await storage.setItem(key, JSON.stringify(snapshot));
  } catch (err) {
    Logger.warn('[CohortCache] write failed', err);
  }
}

export async function readCohortSnapshot(
  identity: CohortIdentity,
  options: ReadOptions
): Promise<CohortSnapshot | null> {
  const storage = options.storage ?? defaultStorage;
  const now = options.now ?? (() => Date.now());
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const key = cohortCacheKey(identity);
  let raw: string | null;
  try {
    raw = await storage.getItem(key);
  } catch (err) {
    Logger.warn('[CohortCache] read failed', err);
    return null;
  }
  if (!raw) return null;
  let parsed: CohortSnapshot | null;
  try {
    parsed = JSON.parse(raw) as CohortSnapshot;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.buildNumber !== options.buildNumber) return null;
  if (typeof parsed.savedAtMs !== 'number') return null;
  if (now() - parsed.savedAtMs > ttlMs) return null;
  return parsed;
}
