import * as SQLite from 'expo-sqlite';

const DB_NAME = 'aniseekr_cache.db';

// Cache the in-flight open as a promise so concurrent callers share one handle.
// See libs/db.ts for the same fix and the Android NullPointerException it avoids.
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function openDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const opened = await SQLite.openDatabaseAsync(DB_NAME);
        await opened.execAsync(`
          CREATE TABLE IF NOT EXISTS cache (
            key TEXT PRIMARY KEY,
            value TEXT,
            timestamp INTEGER,
            ttl INTEGER
          );
        `);
        return opened;
      } catch (err) {
        dbPromise = null;
        throw err;
      }
    })();
  }
  return dbPromise;
}

export interface CachedMeta<T> {
  value: T;
  /** Milliseconds since the entry was written. */
  age: number;
  /** True when age has passed ttl but is still within the caller's graceMs. */
  isStale: boolean;
}

export class CacheService {
  static async init() {
    await openDb();
  }

  static async get<T>(key: string): Promise<T | null> {
    try {
      const db = await openDb();
      const result = await db.getFirstAsync<{
        value: string;
        timestamp: number;
        ttl: number;
      }>('SELECT value, timestamp, ttl FROM cache WHERE key = ?', key);

      if (!result) return null;

      const now = Date.now();
      if (now - result.timestamp > result.ttl) {
        await this.delete(key);
        return null;
      }

      return JSON.parse(result.value) as T;
    } catch (error) {
      console.warn('CacheService.get error:', error);
      return null;
    }
  }

  /**
   * Stale-while-revalidate variant of `get`. Within `ttl` the entry is fresh
   * (isStale=false). Within `ttl + graceMs` it is returned with isStale=true
   * so the caller can render it instantly while triggering a background
   * refresh. Past `ttl + graceMs` the row is deleted and `null` is returned.
   */
  static async getWithMeta<T>(key: string, graceMs: number = 0): Promise<CachedMeta<T> | null> {
    try {
      const db = await openDb();
      const result = await db.getFirstAsync<{
        value: string;
        timestamp: number;
        ttl: number;
      }>('SELECT value, timestamp, ttl FROM cache WHERE key = ?', key);

      if (!result) return null;

      const age = Date.now() - result.timestamp;
      if (age > result.ttl + graceMs) {
        await this.delete(key);
        return null;
      }

      return {
        value: JSON.parse(result.value) as T,
        age,
        isStale: age > result.ttl,
      };
    } catch (error) {
      console.warn('CacheService.getWithMeta error:', error);
      return null;
    }
  }

  static async set(key: string, value: any, ttlMs: number = 3600000) {
    try {
      const db = await openDb();
      const stringValue = JSON.stringify(value);
      const timestamp = Date.now();
      await db.runAsync(
        'INSERT OR REPLACE INTO cache (key, value, timestamp, ttl) VALUES (?, ?, ?, ?)',
        key,
        stringValue,
        timestamp,
        ttlMs
      );
    } catch (error) {
      console.warn('CacheService.set error:', error);
    }
  }

  static async delete(key: string) {
    try {
      const db = await openDb();
      await db.runAsync('DELETE FROM cache WHERE key = ?', key);
    } catch (error) {
      console.warn('CacheService.delete error:', error);
    }
  }

  static async clear() {
    try {
      const db = await openDb();
      await db.runAsync('DELETE FROM cache');
    } catch (error) {
      console.warn('CacheService.clear error:', error);
    }
  }
}
