import { PlatformType, UniversalAnimeItem, AnimeStatus, PLATFORM_CONFIGS } from '../auth/types';
import { authService } from '../auth/auth-service';
import { getProvider } from '../providers';
import { isWritableProvider } from '../providers/base-provider';
import { idMappingService } from './id-mapping-service';
import { conflictResolutionService } from './conflict-resolution-service';
import { offlineQueueService, SyncJob } from './offline-queue-service';
import { syncDirtyTracker } from './sync-dirty-tracker';
import { similarTitles } from './title-normalize';

export type MergeMethod = 'id' | 'title' | 'no';

export interface MappingStats {
  totalItems: number;
  mergedById: number;
  mergedByTitle: number;
  singletons: number;
  coverageMissByPlatform: Record<PlatformType, number>;
}

export interface SyncResult {
  items: UniversalAnimeItem[];
  errors: { platform: PlatformType; error: string }[];
  conflictIds: number[];
  queuedJobs: number;
  mappingStats: MappingStats;
}

const ALL_PLATFORMS = Object.keys(PLATFORM_CONFIGS) as PlatformType[];

function emptyCoverageMiss(): Record<PlatformType, number> {
  return ALL_PLATFORMS.reduce(
    (acc, p) => {
      acc[p] = 0;
      return acc;
    },
    {} as Record<PlatformType, number>
  );
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

    const mergeResult = await this.mergeItems(allItems);
    const { merged, conflictIds } = mergeResult;
    const queuedJobs = await this.propagateChanges(merged, allItems);

    const queueSummary = await this.drainOfflineQueue();
    if (queueSummary.dead > 0) {
      errors.push({
        platform: platforms[0] ?? 'anilist',
        error: `${queueSummary.dead} sync jobs moved to dead-letter queue`,
      });
    }

    const mappingStats: MappingStats = {
      totalItems: allItems.length,
      mergedById: mergeResult.mergedByIdCount,
      mergedByTitle: mergeResult.mergedByTitleCount,
      singletons: mergeResult.singletonCount,
      coverageMissByPlatform: mergeResult.coverageMissByPlatform,
    };

    return { items: merged, errors, conflictIds, queuedJobs, mappingStats };
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

  async mergeItems(items: UniversalAnimeItem[]): Promise<{
    merged: UniversalAnimeItem[];
    conflictIds: number[];
    mergedByIdCount: number;
    mergedByTitleCount: number;
    singletonCount: number;
    coverageMissByPlatform: Record<PlatformType, number>;
  }> {
    const coverageMissByPlatform = emptyCoverageMiss();

    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const newItem = { ...item, platformIds: { ...item.platformIds } };
        const sourcePlatform = item.source;
        const sourceId = item.platformIds[sourcePlatform];

        if (sourceId) {
          const mapped = await idMappingService.mapAllPlatforms(sourcePlatform, sourceId);
          for (const target of ALL_PLATFORMS) {
            if (newItem.platformIds[target]) continue;
            const value = mapped[target];
            if (value) {
              newItem.platformIds[target] = value;
            } else if (target !== sourcePlatform) {
              // Track which target platforms we couldn't reach from this
              // source row. Useful for sysadmins eyeballing the merged
              // mapping's freshness in the settings panel.
              coverageMissByPlatform[target] += 1;
            }
          }
        }
        return newItem;
      })
    );

    const groups: UniversalAnimeItem[][] = [];
    const groupMethods: MergeMethod[] = [];
    const processed = new Set<number>();
    let mergedByIdCount = 0;
    let mergedByTitleCount = 0;

    for (let i = 0; i < enrichedItems.length; i++) {
      if (processed.has(i)) continue;

      const current = enrichedItems[i];
      const group = [current];
      processed.add(i);
      let groupMethod: MergeMethod = 'no';

      for (let j = i + 1; j < enrichedItems.length; j++) {
        if (processed.has(j)) continue;
        const other = enrichedItems[j];

        const { same, method } = this.areSameAnime(current, other);
        if (same) {
          group.push(other);
          processed.add(j);
          // Earliest match wins — once we merged anything by ID, the group
          // is "an ID-matched group". A later title-only match in the same
          // bucket still counts as title since that pair wasn't proven by ID.
          if (method === 'id') {
            mergedByIdCount += 1;
            if (groupMethod === 'no') groupMethod = 'id';
          } else if (method === 'title') {
            mergedByTitleCount += 1;
            if (groupMethod !== 'id') groupMethod = 'title';
          }
        }
      }
      groups.push(group);
      groupMethods.push(groupMethod);
    }

    const merged: UniversalAnimeItem[] = [];
    const conflictIds: number[] = [];
    for (const group of groups) {
      const result = await conflictResolutionService.mergeGroup(group);
      merged.push(result.merged);
      conflictIds.push(...result.conflictIds);
    }

    const singletonCount = groups.reduce((n, g) => n + (g.length === 1 ? 1 : 0), 0);

    return {
      merged,
      conflictIds,
      mergedByIdCount,
      mergedByTitleCount,
      singletonCount,
      coverageMissByPlatform,
    };
  }

  /**
   * Decide whether two enriched items are the same anime.
   *
   * Tier 1 (`'id'`) — any populated platformId matches → definitely same.
   * Tier 2 (`'title'`) — normalized native (or English/Romaji) title match,
   *   guarded by season and (when available) year. Used to bridge gaps when
   *   neither row has an upstream-mapped ID.
   */
  areSameAnime(
    a: UniversalAnimeItem,
    b: UniversalAnimeItem
  ): { same: boolean; method: MergeMethod } {
    for (const key of Object.keys(a.platformIds)) {
      const k = key as PlatformType;
      if (a.platformIds[k] && b.platformIds[k] && a.platformIds[k] === b.platformIds[k]) {
        return { same: true, method: 'id' };
      }
    }

    const titleA = a.titleJapanese || a.titleEnglish || a.titleRomaji || a.title;
    const titleB = b.titleJapanese || b.titleEnglish || b.titleRomaji || b.title;
    if (titleA && titleB) {
      const yearA = a.startDate ? new Date(a.startDate).getFullYear() : undefined;
      const yearB = b.startDate ? new Date(b.startDate).getFullYear() : undefined;
      if (similarTitles(titleA, titleB, { year: yearA, yearB })) {
        return { same: true, method: 'title' };
      }
    }

    return { same: false, method: 'no' };
  }

  private async propagateChanges(
    merged: UniversalAnimeItem[],
    original: UniversalAnimeItem[]
  ): Promise<number> {
    const platforms = authService.getConnectedPlatforms();
    const queueJobs: Parameters<typeof offlineQueueService.enqueueBatch>[0] = [];

    const originalByKey = new Map(
      original.map((o) => [`${o.source}:${o.platformIds[o.source]}`, o])
    );

    for (const item of merged) {
      for (const platform of platforms) {
        const provider = getProvider(platform);
        if (!isWritableProvider(provider)) continue;

        const platformId = item.platformIds[platform];
        if (!platformId) continue;

        const originalItem = originalByKey.get(`${platform}:${platformId}`);

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
