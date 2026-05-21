import {
  DEFAULT_BANGUMI_PREFS,
  type BangumiPreferences,
} from '../../components/bangumi/BangumiSettingsSheet';
import { patchUserPrefs } from './user-prefs';
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

export const BANGUMI_PREFS_STORAGE_KEY = 'aniseekr.bangumi.prefs.v1';

export async function loadBangumiPrefs(): Promise<BangumiPreferences> {
  try {
    const raw = await AsyncStorage.getItem(BANGUMI_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_BANGUMI_PREFS;
    const parsed = JSON.parse(raw) as Partial<BangumiPreferences> & {
      showAdult?: boolean;
    };
    if (!parsed || typeof parsed !== 'object') return DEFAULT_BANGUMI_PREFS;
    // Migration shim: legacy blobs carried `showAdult` here; promote a `true`
    // value once into the unified `allowAdultContent` user-pref and strip the
    // field from the in-memory result so it is not re-persisted.
    const { showAdult, ...rest } = parsed;
    if (showAdult === true) {
      void patchUserPrefs({ allowAdultContent: true }).catch(() => {});
    }
    const merged = { ...DEFAULT_BANGUMI_PREFS, ...rest };
    // Migration: old blobs may not have `baseViewMode`. Seed it from the
    // current viewMode if it's a base view; otherwise keep the default.
    if (rest.baseViewMode === undefined && (rest.viewMode === 'calendar' || rest.viewMode === 'list')) {
      merged.baseViewMode = rest.viewMode;
    }
    return merged;
  } catch (err) {
    Logger.warn('[BangumiPrefs] load failed, using defaults', err);
    return DEFAULT_BANGUMI_PREFS;
  }
}

export async function saveBangumiPrefs(prefs: BangumiPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(BANGUMI_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch (err) {
    Logger.warn('[BangumiPrefs] save failed', err);
  }
}
