import { kvGet, kvSet } from './storage/app-storage';
import { COLLECTION_SORT_MODE_STORAGE_KEY } from './storage/keys';
import { Logger } from '../utils/logger';

export { COLLECTION_SORT_MODE_STORAGE_KEY };

export type CollectionSortMode = 'newest' | 'oldest' | 'rarity' | 'popularity' | 'count' | 'id';

const VALID_SORT_MODES: CollectionSortMode[] = [
  'newest',
  'oldest',
  'rarity',
  'popularity',
  'count',
  'id',
];

/**
 * Synchronous MMKV read. Safe for first-frame `useState` initialisers.
 */
export function loadCollectionSortModeSync(): CollectionSortMode {
  try {
    const raw = kvGet(COLLECTION_SORT_MODE_STORAGE_KEY);
    if (!raw) return 'newest';
    if (VALID_SORT_MODES.includes(raw as CollectionSortMode)) {
      return raw as CollectionSortMode;
    }
    return 'newest';
  } catch (err) {
    Logger.warn('[CollectionPrefs] load sortMode failed, using default', err);
    return 'newest';
  }
}

export async function loadCollectionSortMode(): Promise<CollectionSortMode> {
  return loadCollectionSortModeSync();
}

export async function saveCollectionSortMode(mode: CollectionSortMode): Promise<void> {
  try {
    kvSet(COLLECTION_SORT_MODE_STORAGE_KEY, mode);
  } catch (err) {
    Logger.warn('[CollectionPrefs] save sortMode failed', err);
  }
}
