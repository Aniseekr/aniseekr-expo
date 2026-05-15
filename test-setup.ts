// Test environment setup for bun test.
// Mocks React Native modules and provides minimal SQLite shim so unit tests
// can run in Node without an Expo runtime.

import { mock } from 'bun:test';

// AsyncStorage in-memory shim
const asyncStorageMemory = new Map<string, string>();
mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => asyncStorageMemory.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      asyncStorageMemory.set(k, v);
    },
    removeItem: async (k: string) => {
      asyncStorageMemory.delete(k);
    },
    clear: async () => {
      asyncStorageMemory.clear();
    },
    multiGet: async (keys: string[]) =>
      keys.map((k) => [k, asyncStorageMemory.get(k) ?? null] as [string, string | null]),
    multiSet: async (pairs: [string, string][]) => {
      pairs.forEach(([k, v]) => asyncStorageMemory.set(k, v));
    },
  },
}));

// expo-sqlite minimal in-memory shim
type Row = Record<string, unknown>;
class FakeDatabase {
  private cache = new Map<string, Row>();
  private pilgrimage = new Map<number, Row>();

  async execAsync(_sql: string): Promise<void> {
    return;
  }
  async runAsync(
    sql: string,
    ...params: unknown[]
  ): Promise<{ changes: number; lastInsertRowId: number }> {
    const r = this.run(sql, params);
    return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
  }
  async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    const rows = this.run(sql, params).rows as T[];
    return rows[0] ?? null;
  }
  async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return (this.run(sql, params).rows ?? []) as T[];
  }
  async closeAsync(): Promise<void> {
    return;
  }
  async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
    await fn();
  }
  async prepareAsync(sql: string) {
    const self = this;
    return {
      async executeAsync(params: unknown[] | unknown) {
        const arr = Array.isArray(params) ? params : [params];
        self.run(sql, arr);
        return { changes: 0, lastInsertRowId: 0 };
      },
      async finalizeAsync() {
        return;
      },
    };
  }

  /**
   * Tiny pattern-matched SQL evaluator. Only the queries our tests need are
   * implemented; everything else (CREATE/PRAGMA/DROP/BEGIN/COMMIT) is a no-op.
   */
  private run(sql: string, params: unknown[]) {
    const upper = sql.trim().toUpperCase();
    const result = { changes: 0, lastInsertRowId: 0, rows: [] as Row[] };

    if (
      upper.startsWith('CREATE') ||
      upper.startsWith('DROP') ||
      upper.startsWith('BEGIN') ||
      upper.startsWith('COMMIT') ||
      upper.startsWith('VACUUM')
    ) {
      return result;
    }

    // pragma_page_count() / pragma_page_size() — used by CacheService.getDatabaseFileSize.
    if (upper.startsWith('PRAGMA') || upper.includes('PRAGMA_PAGE_COUNT')) {
      result.rows = [{ size: 0 }];
      return result;
    }

    // ----- cache table -----
    if (upper.startsWith('INSERT OR REPLACE INTO CACHE') || upper.startsWith('INSERT INTO CACHE')) {
      const [key, value, timestamp, ttl] = params as [string, string, number, number];
      this.cache.set(key, { key, value, timestamp, ttl, expires_at: timestamp + ttl });
      result.changes = 1;
      return result;
    }
    if (upper.startsWith('SELECT') && upper.includes('FROM CACHE')) {
      // SELECT key FROM cache — used by CacheService.allKeys.
      if (/^SELECT\s+KEY\s+FROM\s+CACHE\s*$/.test(upper)) {
        result.rows = [...this.cache.values()].map((row) => ({ key: row.key }));
        return result;
      }
      // SELECT key, length(value) AS bytes, timestamp, ttl FROM cache — stats().
      if (upper.includes('LENGTH(VALUE)')) {
        result.rows = [...this.cache.values()].map((row) => ({
          key: row.key,
          bytes: typeof row.value === 'string' ? row.value.length : 0,
          timestamp: row.timestamp,
          ttl: row.ttl,
        }));
        return result;
      }
      // SELECT value, timestamp, ttl FROM cache WHERE key = ?
      const key = params[0] as string;
      const entry = this.cache.get(key);
      if (entry) {
        result.rows = [entry];
      }
      return result;
    }
    if (upper.startsWith('DELETE FROM CACHE')) {
      // DELETE FROM cache WHERE key = ?
      if (upper.includes('WHERE KEY = ?')) {
        const key = params[0] as string;
        const removed = this.cache.delete(key) ? 1 : 0;
        result.changes = removed;
        return result;
      }
      // DELETE FROM cache WHERE key LIKE ? ESCAPE '\'
      if (upper.includes('WHERE KEY LIKE')) {
        const raw = String(params[0] ?? '');
        // Strip trailing % and unescape \_ \% \\ produced by clearByPrefix.
        const literal = raw
          .replace(/%$/, '')
          .replace(/\\_/g, '_')
          .replace(/\\%/g, '%')
          .replace(/\\\\/g, '\\');
        let removed = 0;
        for (const k of [...this.cache.keys()]) {
          if (k.startsWith(literal)) {
            this.cache.delete(k);
            removed++;
          }
        }
        result.changes = removed;
        return result;
      }
      // DELETE FROM cache WHERE timestamp + ttl < ?
      if (upper.includes('TIMESTAMP + TTL')) {
        const cutoff = Number(params[0]);
        let removed = 0;
        for (const [k, v] of this.cache.entries()) {
          if ((v.expires_at as number) < cutoff) {
            this.cache.delete(k);
            removed++;
          }
        }
        result.changes = removed;
        return result;
      }
      // Bare DELETE FROM cache — full clear.
      this.cache.clear();
      return result;
    }

    // ----- pilgrimage_spots table -----
    if (
      upper.startsWith('INSERT OR REPLACE INTO PILGRIMAGE_SPOTS') ||
      upper.startsWith('INSERT INTO PILGRIMAGE_SPOTS')
    ) {
      const [
        bangumi_id,
        title,
        title_cn,
        city,
        cover,
        color,
        center_lat,
        center_lng,
        zoom,
        points_length,
        images_length,
        lite_points_json,
        cached_at,
        expires_at,
      ] = params as unknown[];
      this.pilgrimage.set(Number(bangumi_id), {
        bangumi_id,
        title,
        title_cn,
        city,
        cover,
        color,
        center_lat,
        center_lng,
        zoom,
        points_length,
        images_length,
        lite_points_json,
        cached_at,
        expires_at,
      });
      result.changes = 1;
      return result;
    }
    if (upper.startsWith('SELECT') && upper.includes('FROM PILGRIMAGE_SPOTS')) {
      const id = Number(params[0]);
      const entry = this.pilgrimage.get(id);
      if (entry) result.rows = [entry];
      return result;
    }
    if (upper.startsWith('DELETE FROM PILGRIMAGE_SPOTS')) {
      const cutoff = Number(params[0]);
      let removed = 0;
      for (const [k, v] of this.pilgrimage.entries()) {
        if ((v.expires_at as number) <= cutoff) {
          this.pilgrimage.delete(k);
          removed++;
        }
      }
      result.changes = removed;
      return result;
    }

    return result;
  }
}

mock.module('expo-sqlite', () => ({
  openDatabaseAsync: async (_name: string) => new FakeDatabase(),
}));

// expo-file-system new API (SDK 54 Paths/File/Directory). cache-manager and
// runtime-files-bucket use this; we expose just enough for unit tests.
const fakeFsCacheRoot = '/tmp/test-cache/';
const fakeFsDocsRoot = '/tmp/test-docs/';

class FakeFile {
  readonly uri: string;
  exists = false;
  size = 0;
  constructor(...uris: (string | { uri: string })[]) {
    const parts = uris.map((u) => (typeof u === 'string' ? u : u.uri));
    this.uri = parts.join('').replace(/\/+/g, '/');
  }
  delete(): void {
    this.exists = false;
    this.size = 0;
  }
}

const fakeDir = (uri: string) => ({ uri, size: 0 as number | null });

mock.module('expo-file-system', () => ({
  Paths: {
    cache: fakeDir(fakeFsCacheRoot),
    document: fakeDir(fakeFsDocsRoot),
    bundle: fakeDir('/tmp/test-bundle/'),
    availableDiskSpace: 1_000_000_000,
    totalDiskSpace: 10_000_000_000,
  },
  File: FakeFile,
  Directory: class FakeDirectory {
    uri: string;
    size: number | null = 0;
    constructor(...uris: (string | { uri: string })[]) {
      this.uri = uris.map((u) => (typeof u === 'string' ? u : u.uri)).join('');
    }
    list() {
      return [];
    }
  },
}));

// expo-file-system/legacy — id-mapping-service, anitabi-data-service,
// AvatarUploader, user-repository all use this. Tests never invoke the network
// paths but the static import must resolve.
mock.module('expo-file-system/legacy', () => ({
  cacheDirectory: fakeFsCacheRoot,
  documentDirectory: fakeFsDocsRoot,
  downloadAsync: async (_url: string, _dest: string) => ({ status: 200 }),
  readAsStringAsync: async (_path: string) => '[]',
  writeAsStringAsync: async (_path: string, _content: string) => undefined,
  deleteAsync: async (_path: string) => undefined,
  getInfoAsync: async (_path: string) => ({ exists: false }),
  makeDirectoryAsync: async (_path: string) => undefined,
  copyAsync: async (_options: { from: string; to: string }) => undefined,
  moveAsync: async (_options: { from: string; to: string }) => undefined,
}));

// expo-haptics no-op shim
mock.module('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  impactAsync: async () => undefined,
  notificationAsync: async () => undefined,
  selectionAsync: async () => undefined,
}));

// expo-location default shim. Tests that need richer behaviour install their
// own mocks through LocationService's `module` constructor option.
mock.module('expo-location', () => ({
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 },
  requestForegroundPermissionsAsync: async () => ({ status: 'denied', canAskAgain: false }),
  getForegroundPermissionsAsync: async () => ({ status: 'denied', canAskAgain: false }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: 0, longitude: 0 } }),
  watchPositionAsync: async () => ({ remove: () => undefined }),
}));

// expo-image: render as RN Image + cache-clearing stubs used by ImageDiskBucket /
// ImageMemoryBucket.
mock.module('expo-image', () => {
  const React = require('react');
  const ImageComponent: any = React.forwardRef((props: any, ref: any) =>
    React.createElement('Image', { ...props, ref })
  );
  ImageComponent.clearDiskCache = async () => true;
  ImageComponent.clearMemoryCache = async () => true;
  return { Image: ImageComponent };
});

// react-native shim: Bun cannot parse RN's Flow-typed entrypoint, so we
// substitute a minimal subset that returns plain React.createElement nodes.
// Only the surface used by our components needs to exist.
mock.module('react-native', () => {
  const React = require('react');
  const passthrough = (tag: string) =>
    React.forwardRef((props: any, ref: any) => React.createElement(tag, { ...props, ref }));

  const StyleSheet = {
    create<T extends Record<string, unknown>>(styles: T): T {
      return styles;
    },
    flatten(style: unknown): unknown {
      if (Array.isArray(style)) {
        return Object.assign({}, ...style.flat(Infinity).filter(Boolean));
      }
      return style ?? {};
    },
    absoluteFillObject: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  };

  const Linking = {
    openURL: async (_url: string) => true,
    canOpenURL: async (_url: string) => true,
  };

  const Platform = {
    OS: 'ios' as const,
    select<T>(spec: { ios?: T; android?: T; default?: T; web?: T }): T | undefined {
      return spec.ios ?? spec.default;
    },
  };

  const TurboModuleRegistry = {
    get: () => null,
    getEnforcing: () => ({}),
  };

  const NativeModules: Record<string, unknown> = {};

  const AppState = {
    currentState: 'active',
    addEventListener: () => ({ remove: () => undefined }),
  };

  return {
    View: passthrough('View'),
    Text: passthrough('Text'),
    Pressable: passthrough('Pressable'),
    ScrollView: passthrough('ScrollView'),
    FlatList: passthrough('FlatList'),
    Image: passthrough('Image'),
    ActivityIndicator: passthrough('ActivityIndicator'),
    SafeAreaView: passthrough('SafeAreaView'),
    Switch: passthrough('Switch'),
    StyleSheet,
    Linking,
    Platform,
    TurboModuleRegistry,
    NativeModules,
    AppState,
    Alert: { alert: () => undefined },
    Dimensions: {
      get: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
      addEventListener: () => ({ remove: () => undefined }),
    },
  };
});

// Expo auth / crypto / secure-store / browser stubs. Most tests don't hit
// auth paths but importing MultiPlatformSyncService transitively pulls them in.
mock.module('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
mock.module('expo-auth-session', () => ({
  makeRedirectUri: () => 'aniseekr://oauth/test',
  AuthRequest: class {
    constructor() {}
    async promptAsync() {
      return { type: 'cancel' };
    }
  },
  exchangeCodeAsync: async () => ({ accessToken: '', refreshToken: '', expiresIn: 0 }),
  ResponseType: { Code: 'code' },
  CodeChallengeMethod: { S256: 'S256' },
}));
mock.module('expo-crypto', () => ({
  randomUUID: () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    }),
  digestStringAsync: async () => '',
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
}));
mock.module('expo-web-browser', () => ({
  maybeCompleteAuthSession: () => undefined,
  openAuthSessionAsync: async () => ({ type: 'cancel' }),
  WebBrowserResultType: { CANCEL: 'cancel', SUCCESS: 'success' },
}));
mock.module('expo-notifications', () => ({
  setNotificationHandler: () => undefined,
  getPermissionsAsync: async () => ({ status: 'undetermined' }),
  requestPermissionsAsync: async () => ({ status: 'denied' }),
  scheduleNotificationAsync: async () => '',
  cancelScheduledNotificationAsync: async () => undefined,
  AndroidImportance: { DEFAULT: 3, HIGH: 4, MAX: 5 },
  setNotificationChannelAsync: async () => undefined,
}));
mock.module('expo-tracking-transparency', () => ({
  requestTrackingPermissionsAsync: async () => ({ status: 'denied' }),
  getTrackingPermissionsAsync: async () => ({ status: 'denied' }),
}));

mock.module('@expo/vector-icons', () => {
  const React = require('react');
  const Icon = (name: string) =>
    React.forwardRef((props: any, ref: any) =>
      React.createElement(`Icon:${name}`, { ...props, ref })
    );
  return {
    Ionicons: Icon('Ionicons'),
    MaterialIcons: Icon('MaterialIcons'),
    MaterialCommunityIcons: Icon('MaterialCommunityIcons'),
    Feather: Icon('Feather'),
    FontAwesome: Icon('FontAwesome'),
    Entypo: Icon('Entypo'),
  };
});

// @shopify/react-native-skia: scene analysis imports Skia for native decode.
// Tests cover the pure inference functions only, so a stub that satisfies the
// import shape is sufficient — analyzeImage() itself isn't exercised here.
mock.module('@shopify/react-native-skia', () => ({
  AlphaType: { Unknown: 0, Opaque: 1, Premul: 2, Unpremul: 3 },
  ColorType: { RGBA_8888: 4 },
  Skia: {
    Data: { fromURI: async () => null },
    Image: { MakeImageFromEncoded: () => null },
    Surface: { Make: () => null },
    Paint: () => ({}),
  },
}));

mock.module('expo-linear-gradient', () => {
  const React = require('react');
  return {
    LinearGradient: React.forwardRef((props: any, ref: any) =>
      React.createElement('LinearGradient', { ...props, ref })
    ),
  };
});

// Polyfill fetch if missing (Bun has it; this is defensive for Node fallback)
if (typeof globalThis.fetch !== 'function') {
  globalThis.fetch = (() => Promise.reject(new Error('fetch not available'))) as any;
}
