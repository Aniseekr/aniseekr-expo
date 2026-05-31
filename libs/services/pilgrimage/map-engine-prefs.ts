// Which renderer backs the pilgrimage map surfaces (spec D11 rollout switch).
//
// Default is 'leaflet' so the shipping app is UNCHANGED until the MapLibre
// engine is validated on-device (the P1 spike). A surface opts into MapLibre by
// flipping this flag — never automatically. The Leaflet path is temporary
// rollout-safety and is deleted once all three surfaces validate on MapLibre.
//
// Synchronous read seeds the first frame (Rule 10); subscribers repaint in place.
import { kvGet, kvSet } from '../storage/app-storage';
import { MAP_ENGINE_STORAGE_KEY } from '../storage/keys';
import { Logger } from '../../utils/logger';
import type { MapEngineId } from './map-engine/types';

export { MAP_ENGINE_STORAGE_KEY };

/** MapLibre is now the engine; Leaflet is being removed. */
export const DEFAULT_MAP_ENGINE: MapEngineId = 'maplibre';

function isMapEngineId(value: unknown): value is MapEngineId {
  return value === 'maplibre' || value === 'leaflet';
}

/** Synchronous read of the persisted engine. Frame-1 safe. */
export function loadMapEngineSync(): MapEngineId {
  try {
    const raw = kvGet(MAP_ENGINE_STORAGE_KEY);
    if (isMapEngineId(raw)) return raw;
  } catch (err) {
    Logger.warn('[MapEnginePref] load failed, using default', err);
  }
  return DEFAULT_MAP_ENGINE;
}

/** Async read kept for callers that want a `Promise` signature. */
export async function loadMapEngine(): Promise<MapEngineId> {
  return loadMapEngineSync();
}

type Subscriber = (next: MapEngineId) => void;
const subscribers = new Set<Subscriber>();

export async function setMapEngine(next: MapEngineId): Promise<void> {
  if (!isMapEngineId(next)) return;
  try {
    kvSet(MAP_ENGINE_STORAGE_KEY, next);
  } catch (err) {
    Logger.warn('[MapEnginePref] save failed', err);
  }
  subscribers.forEach((fn) => {
    try {
      fn(next);
    } catch (err) {
      Logger.warn('[MapEnginePref] subscriber threw', err);
    }
  });
}

export function subscribeMapEngine(cb: Subscriber): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}
