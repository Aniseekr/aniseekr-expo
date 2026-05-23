import type { SQLiteDatabase } from 'expo-sqlite';

import { Logger } from '../../utils/logger';
import { kvGet, kvRemove, kvSet } from '../storage/app-storage';

import {
  BACKUP_APP_ID,
  BACKUP_SCHEMA_VERSION,
  type BackupCollectionFolderItemRow,
  type BackupCollectionFolderRow,
  type BackupEnvelopeV1,
  type BackupFavoriteRow,
  type BackupRatingRow,
  type BackupUserAnimeRow,
} from './schema';

const USER_PREFS_KEY = 'aniseekr.user.prefs.v1';
const COLLECTION_SORT_MODE_KEY = 'aniseekr.collection.sortMode.v1';
const BANGUMI_PREFS_KEY = 'aniseekr.bangumi.prefs.v1';

export const BACKUP_PREFS_KEYS = [
  USER_PREFS_KEY,
  COLLECTION_SORT_MODE_KEY,
  BANGUMI_PREFS_KEY,
] as const;

export interface BackupAsyncStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
}

export interface BackupServiceDeps {
  getDb(): Promise<SQLiteDatabase>;
  getStorage(): BackupAsyncStorage;
}

export interface RestoreSummary {
  favorites: number;
  ratings: number;
  userAnime: number;
  collectionFolders: number;
  collectionFolderItems: number;
  prefsRestored: string[];
}

export interface RowDiff {
  added: number; // present in envelope, missing locally
  changed: number; // present in both, content differs
  identical: number; // present in both, content matches
}

export interface PrefsDiff {
  added: string[]; // key in envelope, missing locally
  changed: string[]; // key in both, value differs
  skipped: string[]; // null in envelope → leave local as-is
}

export interface RestoreDiff {
  favorites: RowDiff;
  ratings: RowDiff;
  userAnime: RowDiff;
  collectionFolders: RowDiff;
  collectionFolderItems: RowDiff;
  prefsChanges: PrefsDiff;
  hasChanges: boolean;
}

export class BackupService {
  constructor(private readonly deps: BackupServiceDeps) {}

  async createSnapshot(): Promise<BackupEnvelopeV1> {
    const db = await this.deps.getDb();
    const storage = this.deps.getStorage();

    const [favorites, ratings, userAnime, collectionFolders, collectionFolderItems] =
      await Promise.all([
        readFavorites(db),
        readRatings(db),
        readUserAnime(db),
        readFolders(db),
        readFolderItems(db),
      ]);

    const [userPrefs, sortMode, bangumiPrefs] = await Promise.all([
      storage.getItem(USER_PREFS_KEY),
      storage.getItem(COLLECTION_SORT_MODE_KEY),
      storage.getItem(BANGUMI_PREFS_KEY),
    ]);

    return {
      version: BACKUP_SCHEMA_VERSION,
      app: BACKUP_APP_ID,
      createdAt: Date.now(),
      db: { favorites, ratings, userAnime, collectionFolders, collectionFolderItems },
      prefs: {
        user: userPrefs,
        collectionSortMode: sortMode,
        bangumi: bangumiPrefs,
      },
    };
  }

  async restoreSnapshot(env: BackupEnvelopeV1): Promise<RestoreSummary> {
    if (env.version !== BACKUP_SCHEMA_VERSION) {
      throw new Error(
        `Cannot restore: unsupported backup version ${env.version}, expected ${BACKUP_SCHEMA_VERSION}`
      );
    }

    const db = await this.deps.getDb();
    const storage = this.deps.getStorage();

    const summary: RestoreSummary = {
      favorites: 0,
      ratings: 0,
      userAnime: 0,
      collectionFolders: 0,
      collectionFolderItems: 0,
      prefsRestored: [],
    };

    const work = async () => {
      for (const row of env.db.favorites) {
        await writeFavorite(db, row);
        summary.favorites++;
      }
      for (const row of env.db.ratings) {
        await writeRating(db, row);
        summary.ratings++;
      }
      for (const row of env.db.userAnime) {
        await writeUserAnime(db, row);
        summary.userAnime++;
      }
      for (const row of env.db.collectionFolders) {
        await writeFolder(db, row);
        summary.collectionFolders++;
      }
      for (const row of env.db.collectionFolderItems) {
        await writeFolderItem(db, row);
        summary.collectionFolderItems++;
      }
    };

    if (typeof db.withTransactionAsync === 'function') {
      await db.withTransactionAsync(work);
    } else {
      await work();
    }

    if (env.prefs.user !== null) {
      await storage.setItem(USER_PREFS_KEY, env.prefs.user);
      summary.prefsRestored.push(USER_PREFS_KEY);
    }
    if (env.prefs.collectionSortMode !== null) {
      await storage.setItem(COLLECTION_SORT_MODE_KEY, env.prefs.collectionSortMode);
      summary.prefsRestored.push(COLLECTION_SORT_MODE_KEY);
    }
    if (env.prefs.bangumi !== null) {
      await storage.setItem(BANGUMI_PREFS_KEY, env.prefs.bangumi);
      summary.prefsRestored.push(BANGUMI_PREFS_KEY);
    }

    Logger.info('[BackupService] restoreSnapshot summary', summary);
    return summary;
  }

  /**
   * Report what a `restoreSnapshot(env)` call would change without actually
   * writing anything. The UI shows this to the user as a confirmation step so
   * they can cancel a restore that's about to clobber local edits.
   */
  async dryRunRestore(env: BackupEnvelopeV1): Promise<RestoreDiff> {
    if (env.version !== BACKUP_SCHEMA_VERSION) {
      throw new Error(
        `Cannot diff: unsupported backup version ${env.version}, expected ${BACKUP_SCHEMA_VERSION}`
      );
    }

    const db = await this.deps.getDb();
    const storage = this.deps.getStorage();

    const [favorites, ratings, userAnime, folders, folderItems] = await Promise.all([
      readFavorites(db),
      readRatings(db),
      readUserAnime(db),
      readFolders(db),
      readFolderItems(db),
    ]);

    const diff: RestoreDiff = {
      favorites: diffRows(favorites, env.db.favorites, (r) => r.id),
      ratings: diffRows(ratings, env.db.ratings, (r) => r.id),
      userAnime: diffRows(userAnime, env.db.userAnime, (r) => r.anime_id),
      collectionFolders: diffRows(folders, env.db.collectionFolders, (r) => r.id),
      collectionFolderItems: diffRows(
        folderItems,
        env.db.collectionFolderItems,
        (r) => `${r.folder_id}#${r.anime_id}`
      ),
      prefsChanges: await diffPrefs(storage, env),
      hasChanges: false,
    };

    diff.hasChanges =
      diff.favorites.added + diff.favorites.changed > 0 ||
      diff.ratings.added + diff.ratings.changed > 0 ||
      diff.userAnime.added + diff.userAnime.changed > 0 ||
      diff.collectionFolders.added + diff.collectionFolders.changed > 0 ||
      diff.collectionFolderItems.added + diff.collectionFolderItems.changed > 0 ||
      diff.prefsChanges.added.length + diff.prefsChanges.changed.length > 0;

    return diff;
  }
}

function diffRows<T extends object>(
  local: T[],
  incoming: T[],
  keyOf: (row: T) => string
): RowDiff {
  const byKey = new Map<string, T>();
  for (const row of local) byKey.set(keyOf(row), row);

  let added = 0;
  let changed = 0;
  let identical = 0;
  for (const row of incoming) {
    const existing = byKey.get(keyOf(row));
    if (!existing) {
      added++;
    } else if (rowsEqual(existing as Record<string, unknown>, row as Record<string, unknown>)) {
      identical++;
    } else {
      changed++;
    }
  }
  return { added, changed, identical };
}

function rowsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const av = a[key];
    const bv = b[key];
    // Treat null/undefined as equivalent — SQLite returns `null` for missing
    // values and our envelope may carry undefined for the same fields.
    if ((av === null || av === undefined) && (bv === null || bv === undefined)) continue;
    if (av !== bv) return false;
  }
  return true;
}

async function diffPrefs(storage: BackupAsyncStorage, env: BackupEnvelopeV1): Promise<PrefsDiff> {
  const out: PrefsDiff = { added: [], changed: [], skipped: [] };
  const entries: [string, string | null][] = [
    ['aniseekr.user.prefs.v1', env.prefs.user],
    ['aniseekr.collection.sortMode.v1', env.prefs.collectionSortMode],
    ['aniseekr.bangumi.prefs.v1', env.prefs.bangumi],
  ];
  for (const [key, incoming] of entries) {
    if (incoming === null) {
      out.skipped.push(key);
      continue;
    }
    const current = await storage.getItem(key);
    if (current === null) out.added.push(key);
    else if (current !== incoming) out.changed.push(key);
    else out.skipped.push(key); // identical → no-op
  }
  return out;
}

async function readFavorites(db: SQLiteDatabase): Promise<BackupFavoriteRow[]> {
  const rows = await db.getAllAsync<{
    id: string;
    title: string | null;
    image: string | null;
    addedAt: number | null;
  }>('SELECT id, title, image, addedAt FROM favorites');
  return rows.map((r) => ({
    id: r.id,
    title: r.title ?? null,
    image: r.image ?? null,
    addedAt: r.addedAt ?? null,
  }));
}

async function readRatings(db: SQLiteDatabase): Promise<BackupRatingRow[]> {
  const rows = await db.getAllAsync<{
    id: string;
    rating: string | null;
    timestamp: number | null;
  }>('SELECT id, rating, timestamp FROM ratings');
  return rows.map((r) => ({
    id: r.id,
    rating: r.rating ?? null,
    timestamp: r.timestamp ?? null,
  }));
}

async function readUserAnime(db: SQLiteDatabase): Promise<BackupUserAnimeRow[]> {
  const rows = await db.getAllAsync<BackupUserAnimeRow>(
    `SELECT anime_id, title, image_url, status, score, progress, total_episodes,
            started_at, completed_at, updated_at
       FROM user_anime`
  );
  return rows.map((r) => ({ ...r }));
}

async function readFolders(db: SQLiteDatabase): Promise<BackupCollectionFolderRow[]> {
  const rows = await db.getAllAsync<BackupCollectionFolderRow>(
    `SELECT id, name, icon, type, is_shared, is_r18, created_at FROM collection_folders`
  );
  return rows.map((r) => ({ ...r }));
}

async function readFolderItems(db: SQLiteDatabase): Promise<BackupCollectionFolderItemRow[]> {
  const rows = await db.getAllAsync<BackupCollectionFolderItemRow>(
    `SELECT folder_id, anime_id, added_at FROM collection_folder_items`
  );
  return rows.map((r) => ({ ...r }));
}

async function writeFavorite(db: SQLiteDatabase, row: BackupFavoriteRow): Promise<void> {
  await db.runAsync(
    'INSERT OR REPLACE INTO favorites (id, title, image, addedAt) VALUES (?, ?, ?, ?)',
    row.id,
    row.title ?? '',
    row.image ?? '',
    row.addedAt ?? Date.now()
  );
}

async function writeRating(db: SQLiteDatabase, row: BackupRatingRow): Promise<void> {
  await db.runAsync(
    'INSERT OR REPLACE INTO ratings (id, rating, timestamp) VALUES (?, ?, ?)',
    row.id,
    row.rating ?? 'pass',
    row.timestamp ?? Date.now()
  );
}

async function writeUserAnime(db: SQLiteDatabase, row: BackupUserAnimeRow): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO user_anime
      (anime_id, title, image_url, status, score, progress, total_episodes,
       started_at, completed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.anime_id,
    row.title,
    row.image_url,
    row.status,
    row.score,
    row.progress,
    row.total_episodes,
    row.started_at,
    row.completed_at,
    row.updated_at
  );
}

async function writeFolder(db: SQLiteDatabase, row: BackupCollectionFolderRow): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO collection_folders
      (id, name, icon, type, is_shared, is_r18, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    row.id,
    row.name,
    row.icon,
    row.type,
    row.is_shared,
    row.is_r18,
    row.created_at
  );
}

async function writeFolderItem(
  db: SQLiteDatabase,
  row: BackupCollectionFolderItemRow
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO collection_folder_items (folder_id, anime_id, added_at)
     VALUES (?, ?, ?)`,
    row.folder_id,
    row.anime_id,
    row.added_at
  );
}

// MMKV-backed adapter for the BackupService's storage dependency. The three
// backed-up preference keys (user prefs, collection sort mode, bangumi prefs)
// moved from AsyncStorage to MMKV, so backup/restore must read and write the
// same store the pref modules now use — otherwise a snapshot would capture
// stale or empty prefs.
const mmkvBackupStorage: BackupAsyncStorage = {
  getItem: async (key) => kvGet(key),
  setItem: async (key, value) => {
    kvSet(key, value);
  },
  removeItem: async (key) => {
    kvRemove(key);
  },
};

// Default-construct a BackupService using the production dependencies. Imported
// lazily so test files can avoid dragging in expo-sqlite when they only need
// the BackupService class.
export function createDefaultBackupService(): BackupService {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { LocalDB } = require('../../db') as typeof import('../../db');
  return new BackupService({
    getDb: () => LocalDB.getDatabase(),
    getStorage: () => mmkvBackupStorage,
  });
}
