import type { PlatformType } from './auth/types';
import { Logger } from '../utils/logger';

/**
 * Async key/value storage shape we depend on. Mirrors the subset of the
 * `@react-native-async-storage/async-storage` API we actually use; importing
 * the real module via `require` so the package being uninstalled doesn't
 * break TypeScript builds in environments that don't ship it (CI, web).
 */
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
  // In environments without AsyncStorage (Node tests w/o the shim, web SSR)
  // fall back to a Map-backed shim so callers continue to function.
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

export const BROWSE_SOURCE_STORAGE_KEY = 'aniseekr.browseSource';
export const ALLOW_R18_STORAGE_KEY = 'aniseekr.allowR18Content';
export const DEFAULT_BROWSE_SOURCE: PlatformType = 'anilist';

/**
 * Platforms that expose a usable browse/read surface (search, top, seasonal).
 * Kavita is excluded — it's a self-hosted personal library, not a discovery
 * source. Annict is excluded because it lacks top/seasonal endpoints
 * (per `provider_matrix.csv`).
 */
export const BROWSE_SUPPORTED_PLATFORMS: readonly PlatformType[] = [
  'anilist',
  'myanimelist',
  'bangumi',
  'kitsu',
  'shikimori',
  'simkl',
] as const;

export function isSupportedBrowseSource(platform: PlatformType): boolean {
  return (BROWSE_SUPPORTED_PLATFORMS as readonly PlatformType[]).includes(platform);
}

/**
 * Singleton storing user-tunable knobs that affect the read pipeline:
 *   - browseSource    → which platform feeds top/seasonal screens
 *   - allowR18Content → whether NSFW results pass through the SFW filter
 *
 * Both values are persisted via AsyncStorage and re-hydrated by `init()`.
 */
export class DataSourceConfig {
  private static instance: DataSourceConfig | null = null;
  private _browseSource: PlatformType = DEFAULT_BROWSE_SOURCE;
  private _allowR18Content = false;
  private _initialized = false;

  static getInstance(): DataSourceConfig {
    if (!DataSourceConfig.instance) {
      DataSourceConfig.instance = new DataSourceConfig();
    }
    return DataSourceConfig.instance;
  }

  static __resetForTests(): void {
    DataSourceConfig.instance = null;
  }

  get browseSource(): PlatformType {
    return this._browseSource;
  }

  get allowR18Content(): boolean {
    return this._allowR18Content;
  }

  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Hydrate values from AsyncStorage. Idempotent — safe to call from app
   * bootstrap and again from tests.
   */
  async init(): Promise<void> {
    try {
      const [browseRaw, r18Raw] = await Promise.all([
        AsyncStorage.getItem(BROWSE_SOURCE_STORAGE_KEY),
        AsyncStorage.getItem(ALLOW_R18_STORAGE_KEY),
      ]);

      if (browseRaw && isSupportedBrowseSource(browseRaw as PlatformType)) {
        this._browseSource = browseRaw as PlatformType;
      } else {
        this._browseSource = DEFAULT_BROWSE_SOURCE;
      }

      this._allowR18Content = r18Raw === 'true';
    } catch (err) {
      Logger.warn('[DataSourceConfig] init failed, using defaults', err);
      this._browseSource = DEFAULT_BROWSE_SOURCE;
      this._allowR18Content = false;
    } finally {
      this._initialized = true;
    }
  }

  /**
   * Update the browse source and persist. Throws if `platform` doesn't
   * support browsing (per `BROWSE_SUPPORTED_PLATFORMS`).
   */
  async setBrowseSource(platform: PlatformType): Promise<void> {
    if (!isSupportedBrowseSource(platform)) {
      throw new Error(`Platform ${platform} does not support browse mode`);
    }
    this._browseSource = platform;
    await AsyncStorage.setItem(BROWSE_SOURCE_STORAGE_KEY, platform);
  }

  async setAllowR18Content(allow: boolean): Promise<void> {
    this._allowR18Content = allow;
    await AsyncStorage.setItem(ALLOW_R18_STORAGE_KEY, allow ? 'true' : 'false');
  }
}

export const dataSourceConfig = DataSourceConfig.getInstance();
