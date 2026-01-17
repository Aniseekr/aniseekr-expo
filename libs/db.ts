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

let db: SQLite.SQLiteDatabase | null = null;

export const LocalDB = {
  async init() {
    if (db) return;
    db = await SQLite.openDatabaseAsync(DB_NAME);

    // Create tables
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
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
    `);
    console.log('[LocalDB] Initialized');
  },

  async getDatabase(): Promise<SQLite.SQLiteDatabase> {
    if (!db) await this.init();
    return db!;
  },

  async addFavorite(anime: { id: string; title: string; image: string }) {
    if (!db) await this.init();
    await db?.runAsync(
      'INSERT OR REPLACE INTO favorites (id, title, image, addedAt) VALUES (?, ?, ?, ?)',
      anime.id,
      anime.title,
      anime.image || '',
      Date.now()
    );
  },

  async removeFavorite(animeId: string) {
    if (!db) await this.init();
    await db?.runAsync('DELETE FROM favorites WHERE id = ?', animeId);
  },

  async getFavorites(): Promise<FavoriteItem[]> {
    if (!db) await this.init();
    const result = await db?.getAllAsync<FavoriteItem>(
      'SELECT * FROM favorites ORDER BY addedAt DESC'
    );
    return result || [];
  },

  async isFavorite(animeId: string): Promise<boolean> {
    if (!db) await this.init();
    const result = await db?.getFirstAsync('SELECT id FROM favorites WHERE id = ?', animeId);
    return !!result;
  },

  async addRating(animeId: string, rating: 'like' | 'pass') {
    if (!db) await this.init();
    await db?.runAsync(
      'INSERT OR REPLACE INTO ratings (id, rating, timestamp) VALUES (?, ?, ?)',
      animeId,
      rating,
      Date.now()
    );
  },

  async getStats(): Promise<UserStats> {
    if (!db) await this.init();
    const totalResult = await db?.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM ratings'
    );
    const likedResult = await db?.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM ratings WHERE rating = "like"'
    );

    return {
      totalRated: totalResult?.count || 0,
      likedCount: likedResult?.count || 0,
    };
  },
};
