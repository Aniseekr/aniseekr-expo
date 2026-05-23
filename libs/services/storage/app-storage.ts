// App-wide preference storage, backed by MMKV.
//
// Why MMKV: AsyncStorage reads are asynchronous, which forces every screen to
// render a default value on frame 1 and re-render once the read resolves.
// MMKV is memory-mapped and synchronous, so a `useState` initializer can seed
// the correct value on the first frame — no flash, no extra render.
//
// Scope: only preference-shaped data lives here (theme, map/camera prefs, user
// prefs). Network-fetched payloads stay on expo-sqlite via CacheService —
// MMKV holds its whole dataset in RAM and is not a fit for large caches.

/**
 * The subset of the `react-native-mmkv` instance API this module and the
 * preference services depend on. Declared locally so unit tests (Node, no
 * native binding) can substitute an in-memory implementation.
 */
export interface MMKVLike {
  set(key: string, value: string | number | boolean): void;
  getString(key: string): string | undefined;
  getNumber(key: string): number | undefined;
  getBoolean(key: string): boolean | undefined;
  contains(key: string): boolean;
  remove(key: string): boolean;
  clearAll(): void;
  getAllKeys(): string[];
}

function createInMemoryStore(): MMKVLike {
  const map = new Map<string, string | number | boolean>();
  return {
    set: (key, value) => {
      map.set(key, value);
    },
    getString: (key) => {
      const v = map.get(key);
      return typeof v === 'string' ? v : undefined;
    },
    getNumber: (key) => {
      const v = map.get(key);
      return typeof v === 'number' ? v : undefined;
    },
    getBoolean: (key) => {
      const v = map.get(key);
      return typeof v === 'boolean' ? v : undefined;
    },
    contains: (key) => map.has(key),
    remove: (key) => map.delete(key),
    clearAll: () => map.clear(),
    getAllKeys: () => [...map.keys()],
  };
}

/**
 * Single MMKV instance for all preferences. One instance keeps the mmap'd-
 * region count low; splitting into more instances only pays off for separate
 * encryption keys or App Group sharing, neither of which applies.
 *
 * `require` is used (not a static import) so environments without the native
 * binding — Node unit tests, web SSR — fall back to an in-memory store.
 */
function canUseInMemoryFallback(): boolean {
  const processLike = globalThis.process;
  return (
    processLike?.env?.NODE_ENV === 'test' ||
    processLike?.env?.JEST_WORKER_ID != null ||
    processLike?.env?.VITEST_WORKER_ID != null ||
    typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'
  );
}

export const appStorage: MMKVLike = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
    return createMMKV({ id: 'aniseekr' }) as MMKVLike;
  } catch (err) {
    if (!canUseInMemoryFallback()) throw err;
    return createInMemoryStore();
  }
})();

/** Synchronous string read. Returns `null` on miss — mirrors AsyncStorage. */
export function kvGet(key: string): string | null {
  return appStorage.getString(key) ?? null;
}

/** Synchronous string write. */
export function kvSet(key: string, value: string): void {
  appStorage.set(key, value);
}

/** Synchronous delete. */
export function kvRemove(key: string): void {
  appStorage.remove(key);
}

/** Test-only — drop everything in MMKV. */
export function __resetAppStorageForTests(): void {
  appStorage.clearAll();
}

/**
 * AsyncStorage-shaped adapter on top of the MMKV-backed kv* helpers.
 *
 * Some services accept an `AsyncStorage`-like injection for testability
 * (`AutoBackupScheduler`, `device-cohort-cache`, etc.). In production they get
 * this adapter so reads/writes go to MMKV without changing their internals,
 * and tests still pass their own fake. The Promise wrapping costs one
 * microtask — negligible compared to a real AsyncStorage round-trip.
 */
export const mmkvAsyncStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => kvGet(key),
  setItem: async (key: string, value: string): Promise<void> => {
    kvSet(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    kvRemove(key);
  },
};
