import { LocalDB } from '../../db';
import type { PlatformType } from '../auth/types';

export type DirtyField = 'progress' | 'status' | 'score' | 'all';

export interface DirtyRecord {
  animeId: string;
  platform: PlatformType;
  field: DirtyField;
  markedAt: number;
}

class SyncDirtyTracker {
  private static instance: SyncDirtyTracker;

  static getInstance(): SyncDirtyTracker {
    if (!SyncDirtyTracker.instance) {
      SyncDirtyTracker.instance = new SyncDirtyTracker();
    }
    return SyncDirtyTracker.instance;
  }

  async markDirty(animeId: string, platform: PlatformType, field: DirtyField): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync(
      `INSERT INTO sync_dirty_records (anime_id, platform, field, marked_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(anime_id, platform, field) DO UPDATE SET marked_at = excluded.marked_at`,
      animeId,
      platform,
      field,
      Date.now()
    );
  }

  async markDirtyForAllPlatforms(
    animeId: string,
    platforms: PlatformType[],
    field: DirtyField
  ): Promise<void> {
    if (platforms.length === 0) return;
    const db = await LocalDB.getDatabase();
    await db.withExclusiveTransactionAsync(async (tx) => {
      const now = Date.now();
      for (const platform of platforms) {
        await tx.runAsync(
          `INSERT INTO sync_dirty_records (anime_id, platform, field, marked_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(anime_id, platform, field) DO UPDATE SET marked_at = excluded.marked_at`,
          animeId,
          platform,
          field,
          now
        );
      }
    });
  }

  async clear(animeId: string, platform: PlatformType, field?: DirtyField): Promise<void> {
    const db = await LocalDB.getDatabase();
    if (field) {
      await db.runAsync(
        `DELETE FROM sync_dirty_records WHERE anime_id = ? AND platform = ? AND field = ?`,
        animeId,
        platform,
        field
      );
    } else {
      await db.runAsync(
        `DELETE FROM sync_dirty_records WHERE anime_id = ? AND platform = ?`,
        animeId,
        platform
      );
    }
  }

  async clearAllForPlatform(platform: PlatformType): Promise<number> {
    const db = await LocalDB.getDatabase();
    const result = await db.runAsync(`DELETE FROM sync_dirty_records WHERE platform = ?`, platform);
    return result.changes;
  }

  async listDirty(platform?: PlatformType): Promise<DirtyRecord[]> {
    const db = await LocalDB.getDatabase();
    const rows = platform
      ? await db.getAllAsync<{
          anime_id: string;
          platform: string;
          field: string;
          marked_at: number;
        }>(
          `SELECT anime_id, platform, field, marked_at
           FROM sync_dirty_records WHERE platform = ?
           ORDER BY marked_at ASC`,
          platform
        )
      : await db.getAllAsync<{
          anime_id: string;
          platform: string;
          field: string;
          marked_at: number;
        }>(`SELECT anime_id, platform, field, marked_at
           FROM sync_dirty_records ORDER BY marked_at ASC`);

    return rows.map((row) => ({
      animeId: row.anime_id,
      platform: row.platform as PlatformType,
      field: row.field as DirtyField,
      markedAt: row.marked_at,
    }));
  }

  async hasDirty(platform?: PlatformType): Promise<boolean> {
    const db = await LocalDB.getDatabase();
    const result = platform
      ? await db.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) as count FROM sync_dirty_records WHERE platform = ?`,
          platform
        )
      : await db.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) as count FROM sync_dirty_records`
        );
    return (result?.count ?? 0) > 0;
  }
}

export const syncDirtyTracker = SyncDirtyTracker.getInstance();
