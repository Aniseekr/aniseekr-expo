import { LocalDB } from '../../db';
import { authService } from '../auth/auth-service';
import { getProvider } from '../providers';
import { isWritableProvider } from '../providers/base-provider';
import { idMappingService } from './id-mapping-service';
import { offlineQueueService } from './offline-queue-service';
import { syncDirtyTracker } from './sync-dirty-tracker';
import type { PlatformType, UniversalAnimeItem } from '../auth/types';

export type MigrationState = 'running' | 'completed' | 'failed' | 'cancelled';

export interface MigrationProgressUpdate {
  total: number;
  succeeded: number;
  failed: number;
  state: MigrationState;
  currentTitle?: string;
}

export interface MigrationResult {
  id: number;
  total: number;
  succeeded: number;
  failed: number;
  state: MigrationState;
  failedItems: { animeId: string; title: string; error: string }[];
}

export interface MigrationRecord {
  id: number;
  fromPlatform: PlatformType;
  toPlatform: PlatformType;
  total: number;
  succeeded: number;
  failed: number;
  state: MigrationState;
  startedAt: number;
  finishedAt?: number;
}

export type MigrationProgressListener = (update: MigrationProgressUpdate) => void;

export class PlatformMigrationService {
  private static instance: PlatformMigrationService;
  private cancellationFlag = new Map<number, boolean>();

  static getInstance(): PlatformMigrationService {
    if (!PlatformMigrationService.instance) {
      PlatformMigrationService.instance = new PlatformMigrationService();
    }
    return PlatformMigrationService.instance;
  }

  async migrate(
    fromPlatform: PlatformType,
    toPlatform: PlatformType,
    onProgress?: MigrationProgressListener
  ): Promise<MigrationResult> {
    if (fromPlatform === toPlatform) {
      throw new Error('Cannot migrate to the same platform');
    }
    const fromCreds = await authService.getValidCredentials(fromPlatform);
    const toCreds = await authService.getValidCredentials(toPlatform);
    if (!fromCreds) throw new Error(`Source platform ${fromPlatform} is not connected`);
    if (!toCreds) throw new Error(`Target platform ${toPlatform} is not connected`);

    const fromProvider = getProvider(fromPlatform);
    const toProvider = getProvider(toPlatform);
    if (!isWritableProvider(toProvider)) {
      throw new Error(`Target platform ${toPlatform} is read-only`);
    }

    const items = await fromProvider.fetchUserList(fromCreds.token.accessToken);
    const migrationId = await this.createMigrationRecord(fromPlatform, toPlatform, items.length);

    let succeeded = 0;
    const failedItems: MigrationResult['failedItems'] = [];

    for (const item of items) {
      if (this.cancellationFlag.get(migrationId)) {
        await this.completeRecord(migrationId, succeeded, failedItems.length, 'cancelled');
        onProgress?.({
          total: items.length,
          succeeded,
          failed: failedItems.length,
          state: 'cancelled',
        });
        return {
          id: migrationId,
          total: items.length,
          succeeded,
          failed: failedItems.length,
          state: 'cancelled',
          failedItems,
        };
      }

      onProgress?.({
        total: items.length,
        succeeded,
        failed: failedItems.length,
        state: 'running',
        currentTitle: item.title,
      });

      try {
        const targetId = await this.resolveTargetId(item, toPlatform);
        if (!targetId) {
          throw new Error(`No id mapping for ${item.title} (${fromPlatform} → ${toPlatform})`);
        }

        await offlineQueueService.enqueueBatch([
          {
            type: 'add',
            platform: toPlatform,
            payload: { animeId: targetId, status: item.status },
          },
          {
            type: 'progress',
            platform: toPlatform,
            payload: { animeId: targetId, progress: item.progress },
          },
          ...(typeof item.score === 'number'
            ? [
                {
                  type: 'score' as const,
                  platform: toPlatform,
                  payload: { animeId: targetId, score: item.score },
                },
              ]
            : []),
        ]);
        await syncDirtyTracker.markDirty(targetId, toPlatform, 'all');
        succeeded += 1;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Migration failed';
        failedItems.push({ animeId: item.id, title: item.title, error: message });
        await this.bumpFailure(migrationId, failedItems.length);
      }

      await this.bumpSuccess(migrationId, succeeded);
    }

    const finalState: MigrationState = failedItems.length === 0 ? 'completed' : 'failed';
    await this.completeRecord(migrationId, succeeded, failedItems.length, finalState);
    onProgress?.({
      total: items.length,
      succeeded,
      failed: failedItems.length,
      state: finalState,
    });

    return {
      id: migrationId,
      total: items.length,
      succeeded,
      failed: failedItems.length,
      state: finalState,
      failedItems,
    };
  }

  async cancel(migrationId: number): Promise<void> {
    this.cancellationFlag.set(migrationId, true);
  }

  async listHistory(): Promise<MigrationRecord[]> {
    const db = await LocalDB.getDatabase();
    const rows = await db.getAllAsync<{
      id: number;
      from_platform: string;
      to_platform: string;
      total: number;
      succeeded: number;
      failed: number;
      state: string;
      started_at: number;
      finished_at: number | null;
    }>(
      `SELECT id, from_platform, to_platform, total, succeeded, failed, state,
              started_at, finished_at
       FROM platform_migrations
       ORDER BY started_at DESC LIMIT 50`
    );
    return rows.map((row) => ({
      id: row.id,
      fromPlatform: row.from_platform as PlatformType,
      toPlatform: row.to_platform as PlatformType,
      total: row.total,
      succeeded: row.succeeded,
      failed: row.failed,
      state: row.state as MigrationState,
      startedAt: row.started_at,
      finishedAt: row.finished_at ?? undefined,
    }));
  }

  private async resolveTargetId(
    item: UniversalAnimeItem,
    target: PlatformType
  ): Promise<string | null> {
    if (item.platformIds[target]) return item.platformIds[target]!;
    for (const [platform, id] of Object.entries(item.platformIds)) {
      if (!id) continue;
      const mapped = await idMappingService.mapID(platform, id, target);
      if (mapped) return String(mapped);
    }
    return null;
  }

  private async createMigrationRecord(
    from: PlatformType,
    to: PlatformType,
    total: number
  ): Promise<number> {
    const db = await LocalDB.getDatabase();
    const result = await db.runAsync(
      `INSERT INTO platform_migrations
       (from_platform, to_platform, total, succeeded, failed, state, started_at)
       VALUES (?, ?, ?, 0, 0, 'running', ?)`,
      from,
      to,
      total,
      Date.now()
    );
    return result.lastInsertRowId;
  }

  private async bumpSuccess(migrationId: number, succeeded: number): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync(
      `UPDATE platform_migrations SET succeeded = ? WHERE id = ?`,
      succeeded,
      migrationId
    );
  }

  private async bumpFailure(migrationId: number, failed: number): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync(
      `UPDATE platform_migrations SET failed = ? WHERE id = ?`,
      failed,
      migrationId
    );
  }

  private async completeRecord(
    migrationId: number,
    succeeded: number,
    failed: number,
    state: MigrationState
  ): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync(
      `UPDATE platform_migrations
       SET succeeded = ?, failed = ?, state = ?, finished_at = ?
       WHERE id = ?`,
      succeeded,
      failed,
      state,
      Date.now(),
      migrationId
    );
    this.cancellationFlag.delete(migrationId);
  }
}

export const platformMigrationService = PlatformMigrationService.getInstance();
