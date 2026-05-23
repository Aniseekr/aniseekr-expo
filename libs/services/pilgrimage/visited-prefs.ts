// Local-only persistence for "visited" pilgrimage spots.
// Schema: a single MMKV key holding a JSON-serialised `Record<spotId, true>`
// map. Storing only `true` keeps the payload tiny and unset spots are simply
// absent from the map.
//
// The synchronous read lets the map / spot list seed the "visited" marker
// state on the first frame instead of popping it in after an async resolve.

import { kvGet, kvSet } from '../storage/app-storage';
import { VISITED_SPOTS_STORAGE_KEY } from '../storage/keys';
import { Logger } from '../../utils/logger';

export { VISITED_SPOTS_STORAGE_KEY };

export type VisitedMap = Record<string, true>;

function sanitizeVisited(parsed: unknown): VisitedMap {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const result: VisitedMap = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (v === true) result[k] = true;
  }
  return result;
}

/** Synchronous read — safe to seed `useState` with on the first-paint path. */
export function loadVisitedSpotsSync(): VisitedMap {
  try {
    const raw = kvGet(VISITED_SPOTS_STORAGE_KEY);
    if (!raw) return {};
    return sanitizeVisited(JSON.parse(raw));
  } catch (err) {
    Logger.warn('[VisitedPrefs] load failed, returning empty', err);
    return {};
  }
}

/** Async read kept for callers that want a `Promise` signature. */
export async function loadVisitedSpots(): Promise<VisitedMap> {
  return loadVisitedSpotsSync();
}

export async function saveVisitedSpots(map: VisitedMap): Promise<void> {
  try {
    kvSet(VISITED_SPOTS_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    Logger.warn('[VisitedPrefs] save failed', err);
  }
}
