// CacheManager — single entrypoint for inspecting and clearing every cache
// the app maintains. Caches are surfaced as "buckets"; each bucket reports
// stats and exposes clear / prune. The settings screen talks only to this
// facade so adding a new cache (e.g. map tiles) only needs a new bucket.
//
// **Out of scope** for cache management:
//   - LocalDB (libs/db.ts)        — user collections / ratings / pilgrimage
//   - AsyncStorage                — small user prefs (onboarding, display name)
//   - Paths.document/avatars/     — user avatar files
//
// Those are user data and must never be cleared by "Clear cache" actions.

import { Paths } from 'expo-file-system';
import { MetadataBucket } from './buckets/metadata-bucket';
import { ImageDiskBucket, ImageMemoryBucket } from './buckets/image-bucket';
import { RuntimeFilesBucket } from './buckets/runtime-files-bucket';

export interface BucketStats {
  entries: number;
  bytes: number;
  expiredEntries?: number;
  expiredBytes?: number;
  oldestTimestamp?: number;
  newestTimestamp?: number;
}

export interface CacheSubBucket {
  id: string;
  label: string;
  description?: string;
  stats: BucketStats;
  clear: () => Promise<void>;
}

export interface CacheBucket {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  /** Read-only counter snapshot. Cheap (no payload reads). */
  getStats(): Promise<BucketStats>;
  /** Optional drill-down for buckets with internal categories (metadata, runtime-files). */
  getChildren?(): Promise<CacheSubBucket[]>;
  /** Clear everything this bucket owns. */
  clear(): Promise<void>;
  /** Best-effort eviction of *expired only* entries. Buckets without TTL omit this. */
  prune?(): Promise<{ removed: number }>;
}

export interface StorageOverview {
  cacheDirBytes: number;
  documentDirBytes: number;
  availableDiskBytes: number;
  totalDiskBytes: number;
}

let instance: CacheManager | null = null;

export class CacheManager {
  private readonly buckets: CacheBucket[] = [];

  static getInstance(): CacheManager {
    if (!instance) {
      instance = new CacheManager();
      instance.registerDefaults();
    }
    return instance;
  }

  /** Visible for tests — wipes the singleton + bucket list. */
  static __resetForTests(): void {
    instance = null;
  }

  register(bucket: CacheBucket): void {
    if (this.buckets.some((b) => b.id === bucket.id)) {
      console.warn(`[CacheManager] bucket ${bucket.id} already registered, replacing`);
      this.unregister(bucket.id);
    }
    this.buckets.push(bucket);
  }

  unregister(id: string): void {
    const idx = this.buckets.findIndex((b) => b.id === id);
    if (idx >= 0) this.buckets.splice(idx, 1);
  }

  getBuckets(): readonly CacheBucket[] {
    return this.buckets;
  }

  getBucket(id: string): CacheBucket | undefined {
    return this.buckets.find((b) => b.id === id);
  }

  /** Aggregate stats for every bucket. Failures are logged and reported as zero. */
  async getStats(): Promise<Record<string, BucketStats>> {
    const out: Record<string, BucketStats> = {};
    await Promise.all(
      this.buckets.map(async (b) => {
        try {
          out[b.id] = await b.getStats();
        } catch (error) {
          console.warn(`[CacheManager] ${b.id} getStats failed:`, error);
          out[b.id] = { entries: 0, bytes: 0 };
        }
      })
    );
    return out;
  }

  /**
   * Walk every bucket and clear it. Errors are isolated — one bucket failing
   * does not stop the others.
   */
  async clearAll(): Promise<void> {
    await Promise.all(
      this.buckets.map(async (b) => {
        try {
          await b.clear();
        } catch (error) {
          console.warn(`[CacheManager] ${b.id} clear failed:`, error);
        }
      })
    );
  }

  /**
   * Run prune (TTL-based cleanup) on every bucket that supports it. Returns
   * the total number of entries removed across all buckets so callers can log
   * boot-time savings.
   */
  async pruneAll(): Promise<{ totalRemoved: number }> {
    let totalRemoved = 0;
    await Promise.all(
      this.buckets.map(async (b) => {
        if (!b.prune) return;
        try {
          const result = await b.prune();
          totalRemoved += result.removed;
        } catch (error) {
          console.warn(`[CacheManager] ${b.id} prune failed:`, error);
        }
      })
    );
    return { totalRemoved };
  }

  /**
   * Top-line storage overview — used by the settings screen header. Numbers
   * are read directly from the OS, so they include native-managed caches that
   * the individual buckets cannot introspect (e.g. expo-image internal files).
   */
  async getStorageOverview(): Promise<StorageOverview> {
    const safeSize = (dir: { size: number | null }) => {
      try {
        return dir.size ?? 0;
      } catch {
        return 0;
      }
    };
    return {
      cacheDirBytes: safeSize(Paths.cache),
      documentDirBytes: safeSize(Paths.document),
      availableDiskBytes: Number(Paths.availableDiskSpace) || 0,
      totalDiskBytes: Number(Paths.totalDiskSpace) || 0,
    };
  }

  private registerDefaults() {
    this.register(new MetadataBucket());
    this.register(new ImageDiskBucket());
    this.register(new ImageMemoryBucket());
    this.register(new RuntimeFilesBucket());
  }
}
