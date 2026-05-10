// Local-only persistence for "visited" pilgrimage spots.
// Schema: a single AsyncStorage key holding a JSON-serialised
// `Record<spotId, true>` map. Storing only `true` keeps the payload tiny
// and unset spots are simply absent from the map.

import { Logger } from '../../utils/logger';

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
}

let AsyncStorage: AsyncStorageLike;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  const memoryStorage = new Map<string, string>();
  AsyncStorage = {
    getItem: async (k: string) => memoryStorage.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      memoryStorage.set(k, v);
    },
    removeItem: async (k: string) => {
      memoryStorage.delete(k);
    },
  };
}

export const VISITED_SPOTS_STORAGE_KEY = 'aniseekr.pilgrimage.visited.v1';

export type VisitedMap = Record<string, true>;

export async function loadVisitedSpots(): Promise<VisitedMap> {
  try {
    const raw = await AsyncStorage.getItem(VISITED_SPOTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: VisitedMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v === true) result[k] = true;
    }
    return result;
  } catch (err) {
    Logger.warn('[VisitedPrefs] load failed, returning empty', err);
    return {};
  }
}

export async function saveVisitedSpots(map: VisitedMap): Promise<void> {
  try {
    await AsyncStorage.setItem(VISITED_SPOTS_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    Logger.warn('[VisitedPrefs] save failed', err);
  }
}
