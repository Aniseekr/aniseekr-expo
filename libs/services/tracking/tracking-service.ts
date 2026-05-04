import { LocalDB } from '../../db';
import { AnimeStatus, UniversalAnimeItem } from '../auth/types';
import { multiPlatformSyncService } from '../sync/multi-platform-sync-service';

export interface UserAnimeStatus {
  animeId: string;
  status: AnimeStatus;
  progress: number;
  score?: number;
  totalEpisodes?: number;
  updatedAt: Date;
  title?: string;
  imageUrl?: string;
}

export class TrackingService {
  private static instance: TrackingService;

  static getInstance(): TrackingService {
    if (!TrackingService.instance) {
      TrackingService.instance = new TrackingService();
    }
    return TrackingService.instance;
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

    if (animeDetails) {
      const item: UniversalAnimeItem = {
        id: animeId,
        platformIds: { [animeDetails.source || '']: animeDetails.id || animeId },
        title: animeDetails.title || '',
        imageUrl: animeDetails.imageUrl || '',
        status: status || animeDetails.status || 'watching',
        progress,
        totalEpisodes,
        score: animeDetails.score,
        updatedAt: new Date(now),
        source: animeDetails.source || ('unknown' as any),
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

    if (animeDetails) {
      const item: UniversalAnimeItem = {
        id: animeId,
        platformIds: { [animeDetails.source || '']: animeDetails.id || animeId },
        title: animeDetails.title || '',
        imageUrl: animeDetails.imageUrl || '',
        status,
        progress: animeDetails.progress || 0,
        updatedAt: new Date(now),
        source: animeDetails.source || ('unknown' as any),
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
  }): Promise<void> {
    const db = await LocalDB.getDatabase();
    const now = Date.now();

    await db.runAsync(
      `INSERT INTO user_anime (
        anime_id, title, image_url, status, score, progress, total_episodes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(anime_id) DO UPDATE SET
        status = excluded.status,
        score = COALESCE(excluded.score, user_anime.score),
        progress = COALESCE(excluded.progress, user_anime.progress),
        total_episodes = COALESCE(excluded.total_episodes, user_anime.total_episodes),
        title = COALESCE(excluded.title, user_anime.title),
        image_url = COALESCE(excluded.image_url, user_anime.image_url),
        updated_at = excluded.updated_at`,
      input.animeId,
      input.title ?? null,
      input.imageUrl ?? null,
      input.status,
      input.score ?? null,
      input.progress ?? 0,
      input.totalEpisodes ?? null,
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
    };
  }
}

export const trackingService = TrackingService.getInstance();
