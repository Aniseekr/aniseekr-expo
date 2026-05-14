import * as SQLite from 'expo-sqlite';

const DB_NAME = 'aniseekr.db';

export interface FavoriteItem {
  id: string;
  title: string;
  image: string;
  addedAt: number;
}

export interface RatingItem {
  id: string; // animeId
  rating: 'like' | 'pass';
  timestamp: number;
}

export interface UserStats {
  totalRated: number;
  likedCount: number;
}

export interface PilgrimageRow {
  bangumi_id: number;
  title: string;
  title_cn: string | null;
  city: string | null;
  cover: string | null;
  color: string | null;
  center_lat: number | null;
  center_lng: number | null;
  zoom: number | null;
  points_length: number | null;
  images_length: number | null;
  lite_points_json: string | null;
  cached_at: number;
  expires_at: number;
}

export interface DeckStateRow {
  genre_id: string;
  photos_json: string;
  deck_json: string;
  current_index: number;
  current_page: number;
  has_more: number;
  mode: string;
  updated_at: number;
}

export interface GenreCoverOverrideRow {
  id: string;
  url: string;
  updated_at: number;
}

export interface PilgrimageSaveInput {
  bangumiId: number;
  title: string;
  titleCn?: string | null;
  city?: string | null;
  cover?: string | null;
  color?: string | null;
  centerLat?: number | null;
  centerLng?: number | null;
  zoom?: number | null;
  pointsLength?: number | null;
  imagesLength?: number | null;
  litePointsJson?: string | null;
  cachedAt: number;
  expiresAt: number;
}

// Cache the in-flight open as a promise so concurrent callers share one handle.
// Without this, two parallel `if (!db) await init()` calls both see `db === null`,
// both call openDatabaseAsync, and one of the handles gets orphaned mid-execAsync —
// later runAsync on the orphan throws `NativeDatabase.prepareAsync … NullPointerException`
// on Android.
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function openDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const opened = await SQLite.openDatabaseAsync(DB_NAME);
        // WAL must be set on its own statement (some Android builds choke on it
        // when bundled with DDL in one execAsync).
        await opened.execAsync('PRAGMA journal_mode = WAL');
        await opened.execAsync(DDL);
        console.log('[LocalDB] Initialized');
        return opened;
      } catch (err) {
        dbPromise = null;
        throw err;
      }
    })();
  }
  return dbPromise;
}

const DDL = `
      CREATE TABLE IF NOT EXISTS favorites (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT,
        image TEXT,
        addedAt INTEGER
      );
      CREATE TABLE IF NOT EXISTS ratings (
        id TEXT PRIMARY KEY NOT NULL,
        rating TEXT,
        timestamp INTEGER
      );
      CREATE TABLE IF NOT EXISTS id_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mal_id INTEGER,
        anilist_id INTEGER,
        kitsu_id INTEGER,
        bangumi_id INTEGER,
        shikimori_id INTEGER,
        simkl_id INTEGER,
        annict_id INTEGER,
        thetvdb_id INTEGER,
        themoviedb_id INTEGER,
        livechart_id INTEGER,
        anime_planet_id TEXT,
        anisearch_id INTEGER,
        notify_moe_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_mal_id ON id_mappings(mal_id);
      CREATE INDEX IF NOT EXISTS idx_anilist_id ON id_mappings(anilist_id);
      CREATE INDEX IF NOT EXISTS idx_kitsu_id ON id_mappings(kitsu_id);
      CREATE INDEX IF NOT EXISTS idx_bangumi_id ON id_mappings(bangumi_id);
      CREATE INDEX IF NOT EXISTS idx_shikimori_id ON id_mappings(shikimori_id);
      CREATE INDEX IF NOT EXISTS idx_simkl_id ON id_mappings(simkl_id);
      CREATE INDEX IF NOT EXISTS idx_annict_id ON id_mappings(annict_id);

      CREATE TABLE IF NOT EXISTS id_mappings_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS user_anime (
        anime_id TEXT PRIMARY KEY NOT NULL,
        title TEXT,
        image_url TEXT,
        status TEXT NOT NULL,
        score INTEGER,
        progress INTEGER DEFAULT 0,
        total_episodes INTEGER,
        started_at INTEGER,
        completed_at INTEGER,
        updated_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_status ON user_anime(status);

      CREATE TABLE IF NOT EXISTS collection_folders (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        icon TEXT,
        type TEXT NOT NULL,
        is_shared INTEGER DEFAULT 0,
        is_r18 INTEGER DEFAULT 0,
        created_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS collection_folder_items (
        folder_id TEXT NOT NULL,
        anime_id TEXT NOT NULL,
        added_at INTEGER,
        PRIMARY KEY (folder_id, anime_id),
        FOREIGN KEY (folder_id) REFERENCES collection_folders (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS pilgrimage_spots (
        bangumi_id INTEGER PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        title_cn TEXT,
        city TEXT,
        cover TEXT,
        color TEXT,
        center_lat REAL,
        center_lng REAL,
        zoom INTEGER,
        points_length INTEGER,
        images_length INTEGER,
        lite_points_json TEXT,
        cached_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pilg_city ON pilgrimage_spots(city);
      CREATE INDEX IF NOT EXISTS idx_pilg_expires ON pilgrimage_spots(expires_at);

      CREATE TABLE IF NOT EXISTS sync_dirty_records (
        anime_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        field TEXT NOT NULL,
        marked_at INTEGER NOT NULL,
        PRIMARY KEY (anime_id, platform, field)
      );
      CREATE INDEX IF NOT EXISTS idx_dirty_platform ON sync_dirty_records(platform);

      CREATE TABLE IF NOT EXISTS sync_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_type TEXT NOT NULL,
        platform TEXT NOT NULL,
        payload TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        next_attempt_at INTEGER NOT NULL,
        last_error TEXT,
        state TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_state ON sync_jobs(state, next_attempt_at);

      CREATE TABLE IF NOT EXISTS sync_conflicts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        anime_id TEXT NOT NULL,
        field TEXT NOT NULL,
        values_json TEXT NOT NULL,
        resolved INTEGER DEFAULT 0,
        resolution TEXT,
        detected_at INTEGER NOT NULL,
        resolved_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_conflicts_resolved
        ON sync_conflicts(resolved, detected_at);

      CREATE TABLE IF NOT EXISTS platform_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_platform TEXT NOT NULL,
        to_platform TEXT NOT NULL,
        total INTEGER NOT NULL,
        succeeded INTEGER DEFAULT 0,
        failed INTEGER DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'running',
        started_at INTEGER NOT NULL,
        finished_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS user_achievements (
        achievement_id TEXT PRIMARY KEY NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        unlocked INTEGER NOT NULL DEFAULT 0,
        unlocked_at INTEGER,
        notified INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS economy_balance (
        currency TEXT PRIMARY KEY NOT NULL,
        amount INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS economy_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        currency TEXT NOT NULL,
        delta INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        reason TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ledger_currency ON economy_ledger(currency, created_at);

      CREATE TABLE IF NOT EXISTS scheduled_notifications (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        ref_id TEXT,
        title TEXT NOT NULL,
        body TEXT,
        scheduled_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sched_notif_ref
        ON scheduled_notifications(kind, ref_id);

      CREATE TABLE IF NOT EXISTS swipe_seen (
        id TEXT PRIMARY KEY NOT NULL,
        seen_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_swipe_seen_at ON swipe_seen(seen_at);

      CREATE TABLE IF NOT EXISTS deck_state (
        genre_id TEXT PRIMARY KEY NOT NULL,
        photos_json TEXT NOT NULL,
        deck_json TEXT NOT NULL,
        current_index INTEGER NOT NULL,
        current_page INTEGER NOT NULL,
        has_more INTEGER NOT NULL,
        mode TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_deck_state_updated ON deck_state(updated_at);

      CREATE TABLE IF NOT EXISTS genre_cover_overrides (
        id TEXT PRIMARY KEY NOT NULL,
        url TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `;

export const LocalDB = {
  async init(): Promise<void> {
    await openDb();
  },

  async getDatabase(): Promise<SQLite.SQLiteDatabase> {
    return openDb();
  },

  async addFavorite(anime: { id: string; title: string; image: string }) {
    const db = await openDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO favorites (id, title, image, addedAt) VALUES (?, ?, ?, ?)',
      anime.id,
      anime.title,
      anime.image || '',
      Date.now()
    );
  },

  async removeFavorite(animeId: string) {
    const db = await openDb();
    await db.runAsync('DELETE FROM favorites WHERE id = ?', animeId);
  },

  async getFavorites(): Promise<FavoriteItem[]> {
    const db = await openDb();
    const result = await db.getAllAsync<FavoriteItem>(
      'SELECT * FROM favorites ORDER BY addedAt DESC'
    );
    return result || [];
  },

  async isFavorite(animeId: string): Promise<boolean> {
    const db = await openDb();
    const result = await db.getFirstAsync('SELECT id FROM favorites WHERE id = ?', animeId);
    return !!result;
  },

  async addRating(animeId: string, rating: 'like' | 'pass') {
    const db = await openDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO ratings (id, rating, timestamp) VALUES (?, ?, ?)',
      animeId,
      rating,
      Date.now()
    );
  },

  async markSwipeSeen(animeId: string): Promise<void> {
    const db = await openDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO swipe_seen (id, seen_at) VALUES (?, ?)',
      animeId,
      Date.now()
    );
  },

  async getSwipeSeenIds(): Promise<Set<string>> {
    const db = await openDb();
    const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM swipe_seen');
    return new Set((rows ?? []).map((r) => r.id));
  },

  async clearSwipeSeen(): Promise<void> {
    const db = await openDb();
    await db.runAsync('DELETE FROM swipe_seen');
  },

  async getDeckState(genreId: string): Promise<DeckStateRow | null> {
    const db = await openDb();
    const row = await db.getFirstAsync<DeckStateRow>(
      'SELECT * FROM deck_state WHERE genre_id = ?',
      genreId
    );
    return row ?? null;
  },

  async setDeckState(row: DeckStateRow): Promise<void> {
    const db = await openDb();
    await db.runAsync(
      `INSERT OR REPLACE INTO deck_state (
        genre_id, photos_json, deck_json, current_index,
        current_page, has_more, mode, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      row.genre_id,
      row.photos_json,
      row.deck_json,
      row.current_index,
      row.current_page,
      row.has_more,
      row.mode,
      row.updated_at
    );
  },

  async deleteDeckState(genreId: string): Promise<void> {
    const db = await openDb();
    await db.runAsync('DELETE FROM deck_state WHERE genre_id = ?', genreId);
  },

  async clearAllDeckStates(): Promise<void> {
    const db = await openDb();
    await db.runAsync('DELETE FROM deck_state');
  },

  async getGenreCoverOverrides(): Promise<GenreCoverOverrideRow[]> {
    const db = await openDb();
    const rows = await db.getAllAsync<GenreCoverOverrideRow>(
      'SELECT id, url, updated_at FROM genre_cover_overrides'
    );
    return rows ?? [];
  },

  async setGenreCoverOverride(id: string, url: string): Promise<void> {
    const db = await openDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO genre_cover_overrides (id, url, updated_at) VALUES (?, ?, ?)',
      id,
      url,
      Date.now()
    );
  },

  async getStats(): Promise<UserStats> {
    const db = await openDb();
    const totalResult = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM ratings'
    );
    const likedResult = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM ratings WHERE rating = "like"'
    );

    return {
      totalRated: totalResult?.count || 0,
      likedCount: likedResult?.count || 0,
    };
  },

  async getPilgrimage(bangumiId: number): Promise<PilgrimageRow | null> {
    const db = await openDb();
    const row = await db.getFirstAsync<PilgrimageRow>(
      'SELECT * FROM pilgrimage_spots WHERE bangumi_id = ?',
      bangumiId
    );
    return row ?? null;
  },

  async savePilgrimage(entry: PilgrimageSaveInput): Promise<void> {
    const db = await openDb();
    await db.runAsync(
      `INSERT OR REPLACE INTO pilgrimage_spots (
        bangumi_id, title, title_cn, city, cover, color,
        center_lat, center_lng, zoom,
        points_length, images_length, lite_points_json,
        cached_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      entry.bangumiId,
      entry.title,
      entry.titleCn ?? null,
      entry.city ?? null,
      entry.cover ?? null,
      entry.color ?? null,
      entry.centerLat ?? null,
      entry.centerLng ?? null,
      entry.zoom ?? null,
      entry.pointsLength ?? null,
      entry.imagesLength ?? null,
      entry.litePointsJson ?? null,
      entry.cachedAt,
      entry.expiresAt
    );
  },

  async cleanExpiredPilgrimage(now: number = Date.now()): Promise<number> {
    const db = await openDb();
    const result = await db.runAsync('DELETE FROM pilgrimage_spots WHERE expires_at <= ?', now);
    return result?.changes ?? 0;
  },
};
