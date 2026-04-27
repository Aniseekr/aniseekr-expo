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
  async runAsync(sql: string, ...params: unknown[]): Promise<{ changes: number; lastInsertRowId: number }> {
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

  /**
   * Tiny pattern-matched SQL evaluator. Only the queries our tests need are
   * implemented; everything else (CREATE/PRAGMA/DROP/BEGIN/COMMIT) is a no-op.
   */
  private run(sql: string, params: unknown[]) {
    const upper = sql.trim().toUpperCase();
    const result = { changes: 0, lastInsertRowId: 0, rows: [] as Row[] };

    if (
      upper.startsWith('CREATE') ||
      upper.startsWith('PRAGMA') ||
      upper.startsWith('DROP') ||
      upper.startsWith('BEGIN') ||
      upper.startsWith('COMMIT')
    ) {
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
      const key = params[0] as string;
      const entry = this.cache.get(key);
      if (entry) {
        result.rows = [entry];
      }
      return result;
    }
    if (upper.startsWith('DELETE FROM CACHE')) {
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

// expo-file-system shim — IDMappingService.updateMappings() reads/downloads,
// tests never invoke that path but the static import must resolve.
mock.module('expo-file-system', () => ({
  cacheDirectory: '/tmp/test-cache/',
  documentDirectory: '/tmp/test-docs/',
  downloadAsync: async (_url: string, _dest: string) => ({ status: 200 }),
  readAsStringAsync: async (_path: string) => '[]',
  writeAsStringAsync: async (_path: string, _content: string) => undefined,
  deleteAsync: async (_path: string) => undefined,
  getInfoAsync: async (_path: string) => ({ exists: false }),
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

// expo-image: render as RN Image
mock.module('expo-image', () => {
  const React = require('react');
  return {
    Image: React.forwardRef((props: any, ref: any) =>
      React.createElement('Image', { ...props, ref })
    ),
  };
});

// react-native shim: Bun cannot parse RN's Flow-typed entrypoint, so we
// substitute a minimal subset that returns plain React.createElement nodes.
// Only the surface used by our components needs to exist.
mock.module('react-native', () => {
  const React = require('react');
  const passthrough = (tag: string) =>
    React.forwardRef((props: any, ref: any) =>
      React.createElement(tag, { ...props, ref })
    );

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

  return {
    View: passthrough('View'),
    Text: passthrough('Text'),
    Pressable: passthrough('Pressable'),
    ScrollView: passthrough('ScrollView'),
    FlatList: passthrough('FlatList'),
    Image: passthrough('Image'),
    ActivityIndicator: passthrough('ActivityIndicator'),
    SafeAreaView: passthrough('SafeAreaView'),
    StyleSheet,
    Linking,
    Platform,
  };
});

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
