import { LocalDB } from '../../db';
import { AnimeStatus, PlatformType, UniversalAnimeItem } from '../auth/types';
import { multiPlatformSyncService } from '../sync/multi-platform-sync-service';
import { refreshTrackedIdsSafely } from './tracking-refresh';

export interface UserAnimeStatus {
  animeId: string;
  status: AnimeStatus;
  progress: number;
  score?: number;
  totalEpisodes?: number;
  updatedAt: Date;
  title?: string;
  imageUrl?: string;
  notes?: string;
  rewatchCount?: number;
}

export class TrackingService {
  private static instance: TrackingService;

  static getInstance(): TrackingService {
    if (!TrackingService.instance) {
      TrackingService.instance = new TrackingService();
    }
    return TrackingService.instance;
  }

  // In-memory cache of anime ids the user is currently tracking. Populated
  // lazily on first read and invalidated whenever a write touches user_anime.
  // Saves a round-trip to SQLite every time a list screen needs to mark which
  // rows are tracked.
  private trackedIdsCache: Set<string> | null = null;
  private trackedIdsPromise: Promise<Set<string>> | null = null;
  private readonly trackedIdsListeners = new Set<(ids: Set<string>) => void>();

  private invalidateTrackedIds(): void {
    this.trackedIdsCache = null;
    this.trackedIdsPromise = null;
  }

  /**
   * Public invalidation hook for callers that mutate `user_anime` directly
   * (collection screens, sync workers) without going through this service.
   * Keeps the cached set + screens consistent without a manual refresh.
   */
  invalidateTrackingCache(): void {
    this.invalidateTrackedIds();
    refreshTrackedIdsSafely(() => this.getTrackedIdSet());
  }

  private notifyTrackedIdsChanged(ids: Set<string>): void {
    for (const listener of this.trackedIdsListeners) {
      try {
        listener(ids);
      } catch (err) {
        console.warn('[Tracking] listener error', err);
      }
    }
  }

  /**
   * Returns the set of anime ids the user is tracking. Cached in memory; reads
   * after the first call are O(1) until a write invalidates the cache.
   */
  async getTrackedIdSet(): Promise<Set<string>> {
    if (this.trackedIdsCache) return this.trackedIdsCache;
    if (this.trackedIdsPromise) return this.trackedIdsPromise;

    this.trackedIdsPromise = (async () => {
      const db = await LocalDB.getDatabase();
      const rows = await db.getAllAsync<{ anime_id: string }>(
        'SELECT anime_id FROM user_anime'
      );
      const set = new Set(rows.map((r) => r.anime_id));
      this.trackedIdsCache = set;
      this.trackedIdsPromise = null;
      this.notifyTrackedIdsChanged(set);
      return set;
    })();

    return this.trackedIdsPromise;
  }

  /** Subscribe to tracked-id changes. Returns an unsubscribe function. */
  onTrackedIdsChange(listener: (ids: Set<string>) => void): () => void {
    this.trackedIdsListeners.add(listener);
    return () => {
      this.trackedIdsListeners.delete(listener);
    };
  }

  async updateProgress(
    animeId: string,
    progress: number,
    totalEpisodes?: number,
    animeDetails?: Partial<UniversalAnimeItem>
  ): Promise<void> {
    const db = await LocalDB.getDatabase();
    const now = Date.now();

    let status: AnimeStatus | undefined;
    if (totalEpisodes && progress >= totalEpisodes) {
      status = 'completed';
    }

    const title = animeDetails?.title || null;
    const imageUrl = animeDetails?.imageUrl || null;

    const query = `
      INSERT INTO user_anime (
        anime_id, progress, total_episodes, updated_at
        ${status ? ', status' : ''}
        ${title ? ', title' : ''}
        ${imageUrl ? ', image_url' : ''}
      )
      VALUES (
        ?, ?, ?, ?
        ${status ? ', ?' : ''}
        ${title ? ', ?' : ''}
        ${imageUrl ? ', ?' : ''}
      )
      ON CONFLICT(anime_id) DO UPDATE SET
        progress = excluded.progress,
        total_episodes = excluded.total_episodes,
        updated_at = excluded.updated_at
        ${status ? ', status = excluded.status' : ''}
        ${title ? ', title = excluded.title' : ''}
        ${imageUrl ? ', image_url = excluded.image_url' : ''}
    `;

    const args = [animeId, progress, totalEpisodes || null, now];

    if (status) args.push(status);
    if (title) args.push(title);
    if (imageUrl) args.push(imageUrl);

    await db.runAsync(query, ...args);
    this.invalidateTrackedIds();
    refreshTrackedIdsSafely(() => this.getTrackedIdSet());

    if (animeDetails?.source) {
      const item: UniversalAnimeItem = {
        id: animeId,
        platformIds: { [animeDetails.source]: animeDetails.id || animeId },
        title: animeDetails.title || '',
        imageUrl: animeDetails.imageUrl || '',
        status: status || animeDetails.status || 'watching',
        progress,
        totalEpisodes,
        score: animeDetails.score,
        updatedAt: new Date(now),
        source: animeDetails.source,
      };

      multiPlatformSyncService
        .syncProgressUpdate(item, progress, status || item.status, item.score)
        .catch(console.error);
    }
  }

  async updateStatus(
    animeId: string,
    status: AnimeStatus,
    animeDetails?: Partial<UniversalAnimeItem>
  ): Promise<void> {
    const db = await LocalDB.getDatabase();
    const now = Date.now();

    const title = animeDetails?.title || null;
    const imageUrl = animeDetails?.imageUrl || null;

    const query = `
      INSERT INTO user_anime (
        anime_id, status, updated_at
        ${title ? ', title' : ''}
        ${imageUrl ? ', image_url' : ''}
      )
      VALUES (
        ?, ?, ?
        ${title ? ', ?' : ''}
        ${imageUrl ? ', ?' : ''}
      )
      ON CONFLICT(anime_id) DO UPDATE SET
        status = excluded.status,
        updated_at = excluded.updated_at
        ${title ? ', title = excluded.title' : ''}
        ${imageUrl ? ', image_url = excluded.image_url' : ''}
    `;

    const args = [animeId, status, now];
    if (title) args.push(title);
    if (imageUrl) args.push(imageUrl);

    await db.runAsync(query, ...args);
    this.invalidateTrackedIds();
    refreshTrackedIdsSafely(() => this.getTrackedIdSet());

    if (animeDetails?.source) {
      const item: UniversalAnimeItem = {
        id: animeId,
        platformIds: { [animeDetails.source]: animeDetails.id || animeId },
        title: animeDetails.title || '',
        imageUrl: animeDetails.imageUrl || '',
        status,
        progress: animeDetails.progress || 0,
        updatedAt: new Date(now),
        source: animeDetails.source,
      };

      multiPlatformSyncService
        .syncProgressUpdate(item, item.progress, status, item.score)
        .catch(console.error);
    }
  }

  async upsertTracking(input: {
    animeId: string;
    status: AnimeStatus;
    score?: number;
    progress?: number;
    totalEpisodes?: number;
    title?: string;
    imageUrl?: string;
    folderId?: string;
    /** Free-form user notes (multi-line). Persisted in user_anime.notes. */
    notes?: string;
    /** Number of times the user has rewatched. Persisted in user_anime.rewatch_count. */
    rewatchCount?: number;
    /**
     * Source platform of `animeId`. When provided, remote sync to all connected
     * writable platforms is kicked off via multiPlatformSyncService.
     */
    source?: PlatformType;
  }): Promise<void> {
    const db = await LocalDB.getDatabase();
    const now = Date.now();

    await db.runAsync(
      `INSERT INTO user_anime (
        anime_id, title, image_url, status, score, progress, total_episodes,
        notes, rewatch_count, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(anime_id) DO UPDATE SET
        status = excluded.status,
        score = COALESCE(excluded.score, user_anime.score),
        progress = COALESCE(excluded.progress, user_anime.progress),
        total_episodes = COALESCE(excluded.total_episodes, user_anime.total_episodes),
        title = COALESCE(excluded.title, user_anime.title),
        image_url = COALESCE(excluded.image_url, user_anime.image_url),
        notes = COALESCE(excluded.notes, user_anime.notes),
        rewatch_count = COALESCE(excluded.rewatch_count, user_anime.rewatch_count),
        updated_at = excluded.updated_at`,
      input.animeId,
      input.title ?? null,
      input.imageUrl ?? null,
      input.status,
      input.score ?? null,
      input.progress ?? 0,
      input.totalEpisodes ?? null,
      input.notes ?? null,
      input.rewatchCount ?? null,
      now
    );

    if (input.folderId) {
      await db.runAsync(
        `INSERT OR IGNORE INTO collection_folder_items (folder_id, anime_id, added_at) VALUES (?, ?, ?)`,
        input.folderId,
        input.animeId,
        now
      );
    }

    this.invalidateTrackedIds();
    refreshTrackedIdsSafely(() => this.getTrackedIdSet());

    // Best-effort push to remote platforms. `source` anchors the id-mapping
    // resolver so other connected platforms can be reached even when only one
    // platform id is known.
    if (input.source) {
      const item: UniversalAnimeItem = {
        id: input.animeId,
        platformIds: { [input.source]: input.animeId },
        title: input.title ?? '',
        imageUrl: input.imageUrl ?? '',
        status: input.status,
        progress: input.progress ?? 0,
        totalEpisodes: input.totalEpisodes,
        score: input.score,
        updatedAt: new Date(now),
        source: input.source,
      };
      multiPlatformSyncService
        .syncProgressUpdate(item, item.progress, input.status, input.score)
        .catch(console.error);
    }
  }

  async removeTracking(animeId: string): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync('DELETE FROM user_anime WHERE anime_id = ?', animeId);
    await db.runAsync('DELETE FROM collection_folder_items WHERE anime_id = ?', animeId);
    this.invalidateTrackedIds();
    refreshTrackedIdsSafely(() => this.getTrackedIdSet());
  }

  async getStatus(animeId: string): Promise<UserAnimeStatus | null> {
    const db = await LocalDB.getDatabase();
    const row = await db.getFirstAsync<{
      anime_id: string;
      status: string;
      progress: number;
      score: number;
      total_episodes: number;
      updated_at: number;
      title: string;
      image_url: string;
      notes: string | null;
      rewatch_count: number | null;
    }>('SELECT * FROM user_anime WHERE anime_id = ?', animeId);

    if (!row) return null;

    return {
      animeId: row.anime_id,
      status: row.status as AnimeStatus,
      progress: row.progress,
      score: row.score,
      totalEpisodes: row.total_episodes,
      updatedAt: new Date(row.updated_at),
      title: row.title,
      imageUrl: row.image_url,
      notes: row.notes ?? '',
      rewatchCount: row.rewatch_count ?? 0,
    };
  }
}

export const trackingService = TrackingService.getInstance();
