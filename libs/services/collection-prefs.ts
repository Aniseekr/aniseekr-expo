import { Logger } from '../utils/logger';

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

export type CollectionSortMode = 'newest' | 'oldest' | 'rarity' | 'popularity' | 'count' | 'id';

export const COLLECTION_SORT_MODE_STORAGE_KEY = 'aniseekr.collection.sortMode.v1';

const VALID_SORT_MODES: CollectionSortMode[] = [
  'newest',
  'oldest',
  'rarity',
  'popularity',
  'count',
  'id',
];

export async function loadCollectionSortMode(): Promise<CollectionSortMode> {
  try {
    const raw = await AsyncStorage.getItem(COLLECTION_SORT_MODE_STORAGE_KEY);
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

export async function saveCollectionSortMode(mode: CollectionSortMode): Promise<void> {
  try {
    await AsyncStorage.setItem(COLLECTION_SORT_MODE_STORAGE_KEY, mode);
  } catch (err) {
    Logger.warn('[CollectionPrefs] save sortMode failed', err);
  }
}
