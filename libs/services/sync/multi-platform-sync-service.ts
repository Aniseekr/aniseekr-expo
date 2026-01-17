import { PlatformType, UniversalAnimeItem, AnimeStatus, PLATFORM_CONFIGS } from '../auth/types';
import { authService } from '../auth/auth-service';
import { getProvider } from '../providers';
import { isWritableProvider } from '../providers/base-provider';
import { idMappingService } from './id-mapping-service';

export interface SyncResult {
  items: UniversalAnimeItem[];
  errors: { platform: PlatformType; error: string }[];
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
          const creds = authService.getCredentials(platform);
          if (!creds) return;

          const items = await provider.fetchUserList(creds.token.accessToken);
          allItems.push(...items);
        } catch (error: any) {
          console.error(`Failed to sync ${platform}:`, error);
          errors.push({ platform, error: error.message });
        }
      })
    );

    const mergedItems = await this.mergeItems(allItems);

    await this.propagateChanges(mergedItems, allItems);

    return { items: mergedItems, errors };
  }

  async syncProgressUpdate(
    item: UniversalAnimeItem,
    progress: number,
    status: AnimeStatus,
    score?: number
  ): Promise<void> {
    const platforms = authService.getConnectedPlatforms();

    await Promise.all(
      platforms.map(async (platform) => {
        try {
          const provider = getProvider(platform);
          if (!isWritableProvider(provider)) return;

          const creds = authService.getCredentials(platform);
          if (!creds) return;

          const platformId = await this.resolveId(item, platform);
          if (!platformId) return;

          await provider.updateProgress(platformId, progress, creds.token.accessToken);
          await provider.updateStatus(platformId, status, creds.token.accessToken);

          if (score !== undefined) {
            await provider.updateScore(platformId, score, creds.token.accessToken);
          }
        } catch (error) {
          console.error(`Failed to push update to ${platform}:`, error);
        }
      })
    );
  }

  private async mergeItems(items: UniversalAnimeItem[]): Promise<UniversalAnimeItem[]> {
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

    return groups.map((group) => this.mergeGroup(group));
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

  private mergeGroup(group: UniversalAnimeItem[]): UniversalAnimeItem {
    if (group.length === 0) throw new Error('Empty group');
    if (group.length === 1) return group[0];

    const bestItem = group.reduce((prev, curr) => {
      if (curr.status === 'completed' && prev.status !== 'completed') return curr;
      if (prev.status === 'completed' && curr.status !== 'completed') return prev;

      if (curr.progress > prev.progress) return curr;
      if (prev.progress > curr.progress) return prev;

      if (curr.updatedAt > prev.updatedAt) return curr;
      return prev;
    });

    const platformIds = { ...group[0].platformIds };
    for (const item of group) {
      Object.assign(platformIds, item.platformIds);
    }

    return {
      ...bestItem,
      platformIds,
      title: group.find((i) => i.titleEnglish)?.titleEnglish || bestItem.title,
    };
  }

  private async propagateChanges(
    merged: UniversalAnimeItem[],
    original: UniversalAnimeItem[]
  ): Promise<void> {
    const platforms = authService.getConnectedPlatforms();

    for (const item of merged) {
      for (const platform of platforms) {
        const provider = getProvider(platform);
        if (!isWritableProvider(provider)) continue;

        const creds = authService.getCredentials(platform);
        if (!creds) continue;

        const platformId = item.platformIds[platform];
        if (!platformId) continue;

        const originalItem = original.find(
          (o) => o.source === platform && o.platformIds[platform] === platformId
        );

        if (originalItem) {
          try {
            if (originalItem.progress < item.progress) {
              await provider.updateProgress(platformId, item.progress, creds.token.accessToken);
            }
            if (originalItem.status !== item.status) {
              await provider.updateStatus(platformId, item.status, creds.token.accessToken);
            }
            if (item.score && originalItem.score !== item.score) {
              await provider.updateScore(platformId, item.score, creds.token.accessToken);
            }
          } catch (error) {
            console.error(`Failed to sync updates to ${platform}:`, error);
          }
        } else {
          try {
            if (item.status === 'watching' || item.status === 'completed') {
              await provider.addToList(platformId, item.status, creds.token.accessToken);
              if (item.progress > 0) {
                await provider.updateProgress(platformId, item.progress, creds.token.accessToken);
              }
            }
          } catch (error) {
            console.error(`Failed to add to ${platform}:`, error);
          }
        }
      }
    }
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
