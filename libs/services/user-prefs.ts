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

export const USER_PREFS_STORAGE_KEY = 'aniseekr.user.prefs.v1';

export interface UserPrefs {
  cardHeightPercent: number; // 70-100
  allowAdultContent: boolean;
  bangumiIncludeGames: boolean;
  bangumiShowScoreProminently: boolean;
}

export const DEFAULT_USER_PREFS: UserPrefs = {
  cardHeightPercent: 85,
  allowAdultContent: false,
  bangumiIncludeGames: false,
  bangumiShowScoreProminently: true,
};

export async function loadUserPrefs(): Promise<UserPrefs> {
  try {
    const raw = await AsyncStorage.getItem(USER_PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_USER_PREFS };
    const parsed = JSON.parse(raw) as Partial<UserPrefs>;
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_USER_PREFS };
    return { ...DEFAULT_USER_PREFS, ...parsed };
  } catch (err) {
    Logger.warn('[UserPrefs] load failed, using defaults', err);
    return { ...DEFAULT_USER_PREFS };
  }
}

export async function saveUserPrefs(prefs: UserPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(USER_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch (err) {
    Logger.warn('[UserPrefs] save failed', err);
  }
}

export async function patchUserPrefs(patch: Partial<UserPrefs>): Promise<UserPrefs> {
  const current = await loadUserPrefs();
  const next: UserPrefs = { ...current, ...patch };
  await saveUserPrefs(next);
  return next;
}
