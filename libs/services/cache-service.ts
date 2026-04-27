import * as SQLite from 'expo-sqlite';

const DB_NAME = 'aniseekr_cache.db';

export class CacheService {
  private static db: SQLite.SQLiteDatabase | null = null;

  static async init() {
    if (this.db) return;
    this.db = await SQLite.openDatabaseAsync(DB_NAME);
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT,
        timestamp INTEGER,
        ttl INTEGER
      );
    `);
  }

  static async get<T>(key: string): Promise<T | null> {
    try {
      if (!this.db) await this.init();
      const result = await this.db!.getFirstAsync<{ value: string; timestamp: number; ttl: number }>(
        'SELECT value, timestamp, ttl FROM cache WHERE key = ?',
        key
      );

      if (!result) return null;

      const now = Date.now();
      if (now - result.timestamp > result.ttl) {
        // Expired
        await this.delete(key);
        return null;
      }

      return JSON.parse(result.value) as T;
    } catch (error) {
      console.warn('CacheService.get error:', error);
      return null;
    }
  }

  static async set(key: string, value: any, ttlMs: number = 3600000) { // Default 1 hour
    try {
      if (!this.db) await this.init();
      const stringValue = JSON.stringify(value);
      const timestamp = Date.now();
      await this.db!.runAsync(
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
      if (!this.db) await this.init();
      await this.db!.runAsync('DELETE FROM cache WHERE key = ?', key);
    } catch (error) {
       console.warn('CacheService.delete error:', error);
    }
  }

  static async clear() {
    try {
      if (!this.db) await this.init();
      await this.db!.runAsync('DELETE FROM cache');
    } catch (error) {
        console.warn('CacheService.clear error:', error);
    }
  }
}
