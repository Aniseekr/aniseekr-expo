import { describe, it, expect, beforeEach } from 'bun:test';
import {
  DataSourceConfig,
  BROWSE_SOURCE_STORAGE_KEY,
  ALLOW_R18_STORAGE_KEY,
  DEFAULT_BROWSE_SOURCE,
} from '../../libs/services/data-source-config';

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  clear(): Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsyncStorage = require('@react-native-async-storage/async-storage')
  .default as AsyncStorageLike;

describe('DataSourceConfig', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    DataSourceConfig.__resetForTests();
  });

  it('DSCFG-001 default browseSource is anilist before any user change', async () => {
    const config = DataSourceConfig.getInstance();
    await config.init();
    expect(config.browseSource).toBe(DEFAULT_BROWSE_SOURCE);
    expect(config.browseSource).toBe('anilist');
  });

  it('DSCFG-002 setBrowseSource persists value via AsyncStorage', async () => {
    const config = DataSourceConfig.getInstance();
    await config.init();
    await config.setBrowseSource('bangumi');
    expect(config.browseSource).toBe('bangumi');
    const stored = await AsyncStorage.getItem(BROWSE_SOURCE_STORAGE_KEY);
    expect(stored).toBe('bangumi');
  });

  it('DSCFG-003 init reads stored browseSource', async () => {
    await AsyncStorage.setItem(BROWSE_SOURCE_STORAGE_KEY, 'kitsu');
    const config = DataSourceConfig.getInstance();
    await config.init();
    expect(config.browseSource).toBe('kitsu');
    expect(config.isInitialized).toBe(true);
  });

  it('DSCFG-004 allowR18Content defaults to false (SFW on by default)', async () => {
    const config = DataSourceConfig.getInstance();
    await config.init();
    expect(config.allowR18Content).toBe(false);

    // After persistence + reload it stays in sync.
    await config.setAllowR18Content(true);
    expect(config.allowR18Content).toBe(true);
    expect(await AsyncStorage.getItem(ALLOW_R18_STORAGE_KEY)).toBe('true');

    DataSourceConfig.__resetForTests();
    const reloaded = DataSourceConfig.getInstance();
    await reloaded.init();
    expect(reloaded.allowR18Content).toBe(true);
  });

  it('DSCFG-005 setBrowseSource rejects platform without read support', async () => {
    const config = DataSourceConfig.getInstance();
    await config.init();
    // 'kavita' is a self-hosted personal library — not browse-supported.
    await expect(config.setBrowseSource('kavita')).rejects.toThrow(/does not support/i);
    expect(config.browseSource).toBe(DEFAULT_BROWSE_SOURCE);
    // Storage was never written.
    expect(await AsyncStorage.getItem(BROWSE_SOURCE_STORAGE_KEY)).toBeNull();
  });
});
