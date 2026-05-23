import type { PlatformType } from './auth/types';
import { Logger } from '../utils/logger';

import { kvGet, kvSet } from './storage/app-storage';
import { ALLOW_R18_STORAGE_KEY, BROWSE_SOURCE_STORAGE_KEY } from './storage/keys';

export { BROWSE_SOURCE_STORAGE_KEY, ALLOW_R18_STORAGE_KEY };
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

function readBrowseSourceSync(): PlatformType {
  try {
    const raw = kvGet(BROWSE_SOURCE_STORAGE_KEY);
    if (raw && isSupportedBrowseSource(raw as PlatformType)) {
      return raw as PlatformType;
    }
  } catch (err) {
    Logger.warn('[DataSourceConfig] browseSource read failed', err);
  }
  return DEFAULT_BROWSE_SOURCE;
}

function readAllowR18Sync(): boolean {
  try {
    return kvGet(ALLOW_R18_STORAGE_KEY) === 'true';
  } catch (err) {
    Logger.warn('[DataSourceConfig] allowR18Content read failed', err);
    return false;
  }
}

/**
 * Singleton storing user-tunable knobs that affect the read pipeline:
 *   - browseSource    → which platform feeds top/seasonal screens
 *   - allowR18Content → whether NSFW results pass through the SFW filter
 *
 * Both values are seeded synchronously from MMKV at construction so the very
 * first read returns the user's persisted choice — no "default for one tick,
 * then real value" race that fed empty cache rows and skeleton flashes.
 * `init()` is retained for its `_initialized = true` side effect (which a
 * few callers gate on) but is otherwise a no-op now.
 */
export class DataSourceConfig {
  private static instance: DataSourceConfig | null = null;
  private _browseSource: PlatformType = readBrowseSourceSync();
  private _allowR18Content = readAllowR18Sync();
  private _initialized = true;

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
   * Re-read from MMKV. Idempotent and safe to call from bootstrap or tests.
   * The constructor already seeded values synchronously, so this is mostly
   * a no-op in production — kept so other surfaces (e.g. backup restore)
   * can force a re-read after writing to MMKV under us.
   */
  async init(): Promise<void> {
    this._browseSource = readBrowseSourceSync();
    this._allowR18Content = readAllowR18Sync();
    this._initialized = true;
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
    kvSet(BROWSE_SOURCE_STORAGE_KEY, platform);
  }

  async setAllowR18Content(allow: boolean): Promise<void> {
    this._allowR18Content = allow;
    kvSet(ALLOW_R18_STORAGE_KEY, allow ? 'true' : 'false');
  }
}

export const dataSourceConfig = DataSourceConfig.getInstance();
