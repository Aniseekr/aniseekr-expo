import { queryClient } from '../../query-client';
import type { BucketStats, CacheBucket } from '../cache-manager';

export class QueryClientBucket implements CacheBucket {
  readonly id = 'query.memory';
  readonly label = 'Request cache (memory)';
  readonly description = 'Deduplicated API results for the current app session';
  readonly icon = 'bolt';

  async getStats(): Promise<BucketStats> {
    const stats = queryClient.getStats();
    return {
      entries: stats.entries + stats.inFlightEntries,
      bytes: 0,
    };
  }

  async clear(): Promise<void> {
    queryClient.invalidateAll();
  }
}
