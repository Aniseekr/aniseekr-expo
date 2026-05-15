import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as SQLite from 'expo-sqlite';
import { LocalDB } from '../../libs/db';

interface SqliteTestHooks {
  queueDatabase(options: {
    fail?: Partial<Record<'execAsync' | 'getAllAsync', number | 'always'>>;
    rows?: Record<string, unknown>[];
  }): void;
  reset(): void;
  getOpenCalls(): { name: string; options?: Record<string, unknown> }[];
}

const sqliteHooks = (SQLite as typeof SQLite & { __sqliteTestHooks: SqliteTestHooks })
  .__sqliteTestHooks;
const resetLocalDb = (LocalDB as typeof LocalDB & { __resetForTests(): void }).__resetForTests;

describe('LocalDB stale native handle recovery', () => {
  beforeEach(() => {
    sqliteHooks.reset();
    resetLocalDb();
  });

  afterEach(() => {
    sqliteHooks.reset();
    resetLocalDb();
  });

  it('reuses the fresh handle after one stale-handle recovery on an existing wrapper', async () => {
    sqliteHooks.queueDatabase({ fail: { getAllAsync: 'always' } });
    sqliteHooks.queueDatabase({ rows: [{ id: 'fresh' }] });

    const db = await LocalDB.getDatabase();

    await expect(db.getAllAsync('SELECT id FROM cache')).resolves.toEqual([{ id: 'fresh' }]);
    await expect(db.getAllAsync('SELECT id FROM cache')).resolves.toEqual([{ id: 'fresh' }]);
    expect(sqliteHooks.getOpenCalls()).toHaveLength(2);
  });

  it('opens a new native connection when the cached database is stale during initialization', async () => {
    sqliteHooks.queueDatabase({ fail: { execAsync: 'always' } });
    sqliteHooks.queueDatabase({ rows: [{ id: 'fresh' }] });

    const db = await LocalDB.getDatabase();

    await expect(db.getAllAsync('SELECT id FROM cache')).resolves.toEqual([{ id: 'fresh' }]);
    const openCalls = sqliteHooks.getOpenCalls();
    expect(openCalls).toHaveLength(2);
    expect(openCalls[0]?.options).toBeUndefined();
    expect(openCalls[1]?.options).toEqual({ useNewConnection: true });
  });
});
