import { PlatformType, UniversalAnimeItem, AnimeStatus, PLATFORM_CONFIGS } from '../auth/types';
import { authService } from '../auth/auth-service';
import { getProvider } from '../providers';
import { isWritableProvider } from '../providers/base-provider';
import { idMappingService } from './id-mapping-service';
import { conflictResolutionService } from './conflict-resolution-service';
import { offlineQueueService, SyncJob } from './offline-queue-service';
import { syncDirtyTracker } from './sync-dirty-tracker';

export interface SyncResult {
  items: UniversalAnimeItem[];
  errors: { platform: PlatformType; error: string }[];
  conflictIds: number[];
  queuedJobs: number;
}

export class MultiPlatformSyncService {
  private static instance: MultiPlatformSyncService;

  static getInstance(): MultiPlatformSyncService {
    if (!MultiPlatformSyncService.instance) {
      MultiPlatformSyncService.instance = new MultiPlatformSyncService();
    }
    return MultiPlatformSyncService.instance;
  }

  async syncAll(): Promise<SyncResult> {
    const platforms = authService.getConnectedPlatforms();
    const errors: { platform: PlatformType; error: string }[] = [];
    const allItems: UniversalAnimeItem[] = [];

    await Promise.all(
      platforms.map(async (platform) => {
        try {
          const provider = getProvider(platform);
          const creds = await authService.getValidCredentials(platform);
          if (!creds) return;

          const items = await provider.fetchUserList(creds.token.accessToken);
          allItems.push(...items);
        } catch (error: any) {
          console.error(`Failed to sync ${platform}:`, error);
          errors.push({ platform, error: error.message });
        }
      })
    );

    const { merged, conflictIds } = await this.mergeItems(allItems);
    const queuedJobs = await this.propagateChanges(merged, allItems);

    const queueSummary = await this.drainOfflineQueue();
    if (queueSummary.dead > 0) {
      errors.push({
        platform: platforms[0] ?? 'anilist',
        error: `${queueSummary.dead} sync jobs moved to dead-letter queue`,
      });
    }

    return { items: merged, errors, conflictIds, queuedJobs };
  }

  async syncProgressUpdate(
    item: UniversalAnimeItem,
    progress: number,
    status: AnimeStatus,
    score?: number
  ): Promise<void> {
    const platforms = authService.getConnectedPlatforms();
    const targets: { platform: PlatformType; targetId: string }[] = [];

    for (const platform of platforms) {
      const provider = getProvider(platform);
      if (!isWritableProvider(provider)) continue;
      const targetId = await this.resolveId(item, platform);
      if (!targetId) continue;
      targets.push({ platform, targetId });
    }
    if (targets.length === 0) return;

    const queueJobs: Parameters<typeof offlineQueueService.enqueueBatch>[0] = [];
    for (const { platform, targetId } of targets) {
      queueJobs.push(
        { type: 'progress', platform, payload: { animeId: targetId, progress } },
        { type: 'status', platform, payload: { animeId: targetId, status } }
      );
      if (typeof score === 'number') {
        queueJobs.push({
          type: 'score',
          platform,
          payload: { animeId: targetId, score },
        });
      }
      await syncDirtyTracker.markDirtyForAllPlatforms(
        targetId,
        [platform],
        score !== undefined ? 'all' : 'progress'
      );
    }
    await offlineQueueService.enqueueBatch(queueJobs);
    await this.drainOfflineQueue();
  }

  async drainOfflineQueue() {
    return offlineQueueService.drain((job) => this.executeJob(job));
  }

  private async executeJob(job: SyncJob): Promise<void> {
    const provider = getProvider(job.platform);
    if (!isWritableProvider(provider)) {
      throw new Error(`Provider ${job.platform} does not support writes`);
    }
    const creds = await authService.getValidCredentials(job.platform);
    if (!creds) {
      throw new Error(`Platform ${job.platform} is not connected`);
    }

    const token = creds.token.accessToken;
    const animeId = job.payload.animeId;

    switch (job.jobType) {
      case 'progress':
        if (typeof job.payload.progress !== 'number') {
          throw new Error('progress job missing progress');
        }
        await provider.updateProgress(animeId, job.payload.progress, token);
        await syncDirtyTracker.clear(animeId, job.platform, 'progress');
        return;
      case 'status':
        if (!job.payload.status) {
          throw new Error('status job missing status');
        }
        await provider.updateStatus(animeId, job.payload.status, token);
        await syncDirtyTracker.clear(animeId, job.platform, 'status');
        return;
      case 'score':
        if (typeof job.payload.score !== 'number') {
          throw new Error('score job missing score');
        }
        await provider.updateScore(animeId, job.payload.score, token);
        await syncDirtyTracker.clear(animeId, job.platform, 'score');
        return;
      case 'add':
        if (!job.payload.status) {
          throw new Error('add job missing status');
        }
        await provider.addToList(animeId, job.payload.status, token);
        await syncDirtyTracker.clear(animeId, job.platform);
        return;
      case 'remove':
        await provider.removeFromList(animeId, token);
        await syncDirtyTracker.clear(animeId, job.platform);
        return;
    }
  }

  private async mergeItems(
    items: UniversalAnimeItem[]
  ): Promise<{ merged: UniversalAnimeItem[]; conflictIds: number[] }> {
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const newItem = { ...item, platformIds: { ...item.platformIds } };
        const sourcePlatform = item.source;
        const sourceId = item.platformIds[sourcePlatform];

        if (sourceId) {
          const platforms = Object.keys(PLATFORM_CONFIGS) as PlatformType[];
          for (const target of platforms) {
            if (!newItem.platformIds[target]) {
              const mappedId = await idMappingService.mapID(sourcePlatform, sourceId, target);
              if (mappedId) {
                newItem.platformIds[target] = String(mappedId);
              }
            }
          }
        }
        return newItem;
      })
    );

    const groups: UniversalAnimeItem[][] = [];
    const processed = new Set<number>();

    for (let i = 0; i < enrichedItems.length; i++) {
      if (processed.has(i)) continue;

      const current = enrichedItems[i];
      const group = [current];
      processed.add(i);

      for (let j = i + 1; j < enrichedItems.length; j++) {
        if (processed.has(j)) continue;
        const other = enrichedItems[j];

        if (this.areSameAnime(current, other)) {
          group.push(other);
          processed.add(j);
        }
      }
      groups.push(group);
    }

    const merged: UniversalAnimeItem[] = [];
    const conflictIds: number[] = [];
    for (const group of groups) {
      const result = await conflictResolutionService.mergeGroup(group);
      merged.push(result.merged);
      conflictIds.push(...result.conflictIds);
    }

    return { merged, conflictIds };
  }

  private areSameAnime(a: UniversalAnimeItem, b: UniversalAnimeItem): boolean {
    for (const key of Object.keys(a.platformIds)) {
      const k = key as PlatformType;
      if (a.platformIds[k] && b.platformIds[k] && a.platformIds[k] === b.platformIds[k]) {
        return true;
      }
    }
    return false;
  }

  private async propagateChanges(
    merged: UniversalAnimeItem[],
    original: UniversalAnimeItem[]
  ): Promise<number> {
    const platforms = authService.getConnectedPlatforms();
    const queueJobs: Parameters<typeof offlineQueueService.enqueueBatch>[0] = [];

    for (const item of merged) {
      for (const platform of platforms) {
        const provider = getProvider(platform);
        if (!isWritableProvider(provider)) continue;

        const platformId = item.platformIds[platform];
        if (!platformId) continue;

        const originalItem = original.find(
          (o) => o.source === platform && o.platformIds[platform] === platformId
        );

        if (originalItem) {
          if (originalItem.progress < item.progress) {
            queueJobs.push({
              type: 'progress',
              platform,
              payload: { animeId: platformId, progress: item.progress },
            });
          }
          if (originalItem.status !== item.status) {
            queueJobs.push({
              type: 'status',
              platform,
              payload: { animeId: platformId, status: item.status },
            });
          }
          if (typeof item.score === 'number' && originalItem.score !== item.score) {
            queueJobs.push({
              type: 'score',
              platform,
              payload: { animeId: platformId, score: item.score },
            });
          }
        } else if (item.status === 'watching' || item.status === 'completed') {
          queueJobs.push({
            type: 'add',
            platform,
            payload: { animeId: platformId, status: item.status },
          });
          if (item.progress > 0) {
            queueJobs.push({
              type: 'progress',
              platform,
              payload: { animeId: platformId, progress: item.progress },
            });
          }
        }
      }
    }

    if (queueJobs.length === 0) return 0;
    await offlineQueueService.enqueueBatch(queueJobs);
    return queueJobs.length;
  }

  private async resolveId(
    item: UniversalAnimeItem,
    targetPlatform: PlatformType
  ): Promise<string | undefined> {
    if (item.platformIds[targetPlatform]) return item.platformIds[targetPlatform];

    for (const [sourcePlatform, sourceId] of Object.entries(item.platformIds)) {
      if (sourceId) {
        const mapped = await idMappingService.mapID(
          sourcePlatform,
          sourceId as string,
          targetPlatform
        );
        if (mapped) return String(mapped);
      }
    }
    return undefined;
  }
}

export const multiPlatformSyncService = MultiPlatformSyncService.getInstance();
