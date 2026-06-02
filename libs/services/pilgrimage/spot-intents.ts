// Local-only persistence for pilgrimage spot intents (saved / planned).
// Schema: a single MMKV key holding a JSON `Record<spotId, SpotIntent>`.
//
// The synchronous read lets the map / spot list seed save & plan markers on
// the first frame instead of popping them in after an async resolve.

import { kvGet, kvSet } from '../storage/app-storage';
import { SPOT_INTENTS_STORAGE_KEY } from '../storage/keys';
import { Logger } from '../../utils/logger';

export type SpotIntentKind = 'saved' | 'planned';

export interface SpotIntent {
  saved?: true;
  planned?: true;
}

export type SpotIntentMap = Record<string, SpotIntent>;

/** Synchronous read — safe to seed `useState` with on the first-paint path. */
export function loadSpotIntentsSync(): SpotIntentMap {
  try {
    const raw = kvGet(SPOT_INTENTS_STORAGE_KEY);
    if (!raw) return {};
    return sanitizeSpotIntents(JSON.parse(raw) as unknown);
  } catch (err) {
    Logger.warn('[SpotIntents] load failed, returning empty', err);
    return {};
  }
}

/** Async read kept for callers that want a `Promise` signature. */
export async function loadSpotIntents(): Promise<SpotIntentMap> {
  return loadSpotIntentsSync();
}

export async function saveSpotIntents(map: SpotIntentMap): Promise<void> {
  try {
    kvSet(SPOT_INTENTS_STORAGE_KEY, JSON.stringify(sanitizeSpotIntents(map)));
  } catch (err) {
    Logger.warn('[SpotIntents] save failed', err);
  }
}

export function toggleSpotIntent(
  map: SpotIntentMap,
  spotId: string,
  intent: SpotIntentKind
): SpotIntentMap {
  const current = map[spotId] ?? {};
  const nextIntent: SpotIntent = { ...current };
  if (nextIntent[intent]) delete nextIntent[intent];
  else nextIntent[intent] = true;

  const next: SpotIntentMap = { ...map };
  if (nextIntent.saved || nextIntent.planned) next[spotId] = nextIntent;
  else delete next[spotId];
  return next;
}

function sanitizeSpotIntents(value: unknown): SpotIntentMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: SpotIntentMap = {};
  for (const [spotId, rawIntent] of Object.entries(value as Record<string, unknown>)) {
    if (!spotId || !rawIntent || typeof rawIntent !== 'object' || Array.isArray(rawIntent)) {
      continue;
    }
    const source = rawIntent as Record<string, unknown>;
    const intent: SpotIntent = {};
    if (source.saved === true) intent.saved = true;
    if (source.planned === true) intent.planned = true;
    if (intent.saved || intent.planned) out[spotId] = intent;
  }
  return out;
}
