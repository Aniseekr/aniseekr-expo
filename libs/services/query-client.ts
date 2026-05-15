import type { PlatformType } from './auth/types';

/**
 * In-memory request deduplication + 5-minute stale time.
 *
 * - Two parallel `fetch()` calls with the same key share the same Promise.
 * - A second sequential call within `staleTimeMs` returns the cached value
 *   without invoking the fetcher.
 * - A failed fetcher does NOT poison the cache: the in-flight entry is
 *   removed so the next call can retry.
 *
 * Mirrors the actor-based `QueryClient.swift` minus Swift type erasure.
 */

export interface QueryKeyObject {
  name: string;
  params?: Record<string, string | number | boolean>;
}

export type QueryKeyInput = string | QueryKeyObject;

export interface FetchOptions {
  /**
   * Optional override for the default 5-minute stale time. Useful for
   * frequently-changing data (e.g., 30 s for user feed) or rarely-changing
   * data (e.g., 24 h for genre lists).
   */
  staleTimeMs?: number;
}

interface CacheEntry {
  value: unknown;
  /** ms-since-epoch when the entry was written. */
  timestamp: number;
  /** Frozen string used by `invalidateForPlatform` for substring matching. */
  serializedKey: string;
}

export interface QueryClientStats {
  entries: number;
  inFlightEntries: number;
}

const DEFAULT_STALE_TIME_MS = 5 * 60 * 1000;

export class QueryClient {
  private static instance: QueryClient | null = null;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private nowFn: () => number = Date.now;
  private generation = 0;

  static getInstance(): QueryClient {
    if (!QueryClient.instance) {
      QueryClient.instance = new QueryClient();
    }
    return QueryClient.instance;
  }

  static __resetForTests(): void {
    QueryClient.instance = null;
  }

  /** Override the time source. Used by tests to drive virtual time. */
  __setNow(nowFn: () => number): void {
    this.nowFn = nowFn;
  }

  async fetch<T>(
    key: QueryKeyInput,
    fetcher: () => Promise<T>,
    options: FetchOptions = {}
  ): Promise<T> {
    const serialized = serializeKey(key);
    const stale = options.staleTimeMs ?? DEFAULT_STALE_TIME_MS;

    // 1. Cache hit within stale time?
    const cached = this.cache.get(serialized);
    if (cached) {
      const age = this.nowFn() - cached.timestamp;
      if (age < stale) {
        return cached.value as T;
      }
    }

    // 2. In-flight request → join.
    const existing = this.inFlight.get(serialized);
    if (existing) {
      return (await existing) as T;
    }

    // 3. Otherwise create and register a new request.
    const generationAtStart = this.generation;
    let promise!: Promise<T>;
    promise = (async () => {
      try {
        const value = await fetcher();
        if (generationAtStart === this.generation) {
          this.cache.set(serialized, {
            value,
            timestamp: this.nowFn(),
            serializedKey: serialized,
          });
        }
        return value;
      } finally {
        // Only the currently tracked promise may clear the in-flight slot. A
        // cache invalidation can remove this promise while a newer request for
        // the same key is already running.
        if (this.inFlight.get(serialized) === promise) {
          this.inFlight.delete(serialized);
        }
      }
    })();

    this.inFlight.set(serialized, promise);
    return (await promise) as T;
  }

  /**
   * Drop everything. Useful when the user logs out or after a destructive
   * sync.
   */
  invalidateAll(): void {
    this.cache.clear();
    this.inFlight.clear();
    this.generation += 1;
  }

  /**
   * Drop every cache entry whose serialized key contains the platform's
   * raw value. This includes both the key name (e.g., `seasonal_anilist`)
   * and any param value (e.g., `{ source: 'anilist' }`).
   */
  invalidateForPlatform(platform: PlatformType): void {
    for (const [serialized] of this.cache) {
      if (serialized.includes(platform)) {
        this.cache.delete(serialized);
      }
    }
  }

  /** Inspection helper for tests. Returns whether a key has a cached value. */
  has(key: QueryKeyInput): boolean {
    return this.cache.has(serializeKey(key));
  }

  /** Inspection helper for cache management UI and tests. */
  getStats(): QueryClientStats {
    return {
      entries: this.cache.size,
      inFlightEntries: this.inFlight.size,
    };
  }
}

function serializeKey(key: QueryKeyInput): string {
  if (typeof key === 'string') return key;
  if (!key.params) return key.name;
  // Sort keys for stable hashing across call sites.
  const entries = Object.entries(key.params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`);
  return entries.length === 0 ? key.name : `${key.name}?${entries.join('&')}`;
}

export const queryClient = QueryClient.getInstance();
export { serializeKey as __serializeKey };
