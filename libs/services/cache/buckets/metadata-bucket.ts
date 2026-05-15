// MetadataBucket — surface for the SQLite-backed CacheService K/V store.
//
// Sub-buckets are derived from the well-known key prefixes used by
// anime-repository.ts (`anime_detail_`, `seasonal_`, `search_`, ...) and
// anitabi-service.ts (`anitabi_detail_`). New prefixes that don't appear
// in METADATA_GROUPS fall into the `misc` sub-bucket so they remain
// visible and clearable.
//
// The bucket NEVER touches LocalDB (user collections) or AsyncStorage.

import { CacheService } from '../../cache-service';
import type { CacheBucket, CacheSubBucket, BucketStats } from '../cache-manager';

interface MetadataGroup {
  id: string;
  label: string;
  description?: string;
  prefixes: readonly string[];
}

const METADATA_GROUPS: readonly MetadataGroup[] = [
  {
    id: 'anime_detail',
    label: '動畫詳細頁',
    description: 'Anime detail responses',
    prefixes: ['anime_detail_'],
  },
  {
    id: 'seasonal',
    label: '季度列表',
    description: 'Seasonal page lists',
    prefixes: ['seasonal_', 'seasonalpage_'],
  },
  {
    id: 'anitabi',
    label: 'Anitabi 巡禮資料',
    description: 'Anitabi detailed points',
    prefixes: ['anitabi_detail_'],
  },
  {
    id: 'search',
    label: '搜尋結果',
    description: 'Search responses',
    prefixes: ['search_'],
  },
  {
    id: 'browse',
    label: '瀏覽 / 趨勢',
    description: 'Top, trending, genre lists',
    prefixes: [
      'top_anime_',
      'trending_anime_',
      'genre_',
      'genres_list_',
      'anime_genres_',
    ],
  },
];

const ALL_KNOWN_PREFIXES: readonly string[] = METADATA_GROUPS.flatMap(
  (g) => g.prefixes
);

export class MetadataBucket implements CacheBucket {
  readonly id = 'metadata';
  readonly label = '快取資料 (Metadata)';
  readonly description = 'API 回應、動畫資料、巡禮點資料';
  readonly icon = 'storage';

  async getStats(): Promise<BucketStats> {
    const stats = await CacheService.stats(ALL_KNOWN_PREFIXES);
    return {
      entries: stats.totalEntries,
      bytes: stats.totalBytes,
      expiredEntries: stats.expiredEntries,
      expiredBytes: stats.expiredBytes,
      oldestTimestamp: stats.oldestTimestamp || undefined,
      newestTimestamp: stats.newestTimestamp || undefined,
    };
  }

  async getChildren(): Promise<CacheSubBucket[]> {
    const stats = await CacheService.stats(ALL_KNOWN_PREFIXES);
    const children: CacheSubBucket[] = [];

    for (const group of METADATA_GROUPS) {
      let entries = 0;
      let bytes = 0;
      let expiredEntries = 0;
      let expiredBytes = 0;
      for (const prefix of group.prefixes) {
        const stat = stats.byPrefix.get(prefix);
        if (!stat) continue;
        entries += stat.entries;
        bytes += stat.bytes;
        expiredEntries += stat.expiredEntries;
        expiredBytes += stat.expiredBytes;
      }
      // Skip empty groups — keeps the UI focused on what's actually cached.
      if (entries === 0) continue;
      children.push({
        id: `metadata.${group.id}`,
        label: group.label,
        description: group.description,
        stats: { entries, bytes, expiredEntries, expiredBytes },
        clear: async () => {
          for (const prefix of group.prefixes) {
            await CacheService.clearByPrefix(prefix);
          }
        },
      });
    }

    // "Misc" catches keys that don't match any registered prefix. Surfacing them
    // means a new cache source can never become invisible just because nobody
    // updated METADATA_GROUPS.
    const miscStat = stats.byPrefix.get('misc');
    if (miscStat && miscStat.entries > 0) {
      children.push({
        id: 'metadata.misc',
        label: '其他',
        description: 'Uncategorised cache entries',
        stats: {
          entries: miscStat.entries,
          bytes: miscStat.bytes,
          expiredEntries: miscStat.expiredEntries,
          expiredBytes: miscStat.expiredBytes,
        },
        clear: async () => {
          // Delete every key that does not start with a known prefix. Slower
          // than a single SQL DELETE but only walks N keys (length, no values).
          const all = await CacheService.allKeys();
          for (const key of all) {
            const matched = ALL_KNOWN_PREFIXES.some((p) => key.startsWith(p));
            if (!matched) await CacheService.delete(key);
          }
        },
      });
    }

    return children;
  }

  async clear(): Promise<void> {
    await CacheService.clear();
  }

  async prune(): Promise<{ removed: number }> {
    const removed = await CacheService.prune();
    if (removed > 0) {
      // Reclaim the disk space the deleted rows were using. VACUUM is fine to
      // run inline here because prune is invoked at startup, not in hot paths.
      await CacheService.vacuum();
    }
    return { removed };
  }
}
