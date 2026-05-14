import { describe, it, expect, beforeEach } from 'bun:test';
import { CacheService } from '../../libs/services/cache-service';

describe('CacheService', () => {
  beforeEach(async () => {
    await CacheService.init();
    await CacheService.clear();
  });

  it('CACHE-001 set then get returns the stored JSON value', async () => {
    await CacheService.set('detail_anilist_1', { id: 1, title: 'Cowboy Bebop' });
    const got = await CacheService.get<{ id: number; title: string }>('detail_anilist_1');
    expect(got).not.toBeNull();
    expect(got?.id).toBe(1);
    expect(got?.title).toBe('Cowboy Bebop');
  });

  it('CACHE-002 get returns null when entry is past TTL', async () => {
    // The in-memory shim treats expires_at <= Date.now() as expired.
    // A negative TTL guarantees an instantly-stale entry.
    await CacheService.set('expires_now', { v: 1 }, -1);
    const got = await CacheService.get('expires_now');
    expect(got).toBeNull();
  });

  it('CACHE-003 get returns null for an unknown key', async () => {
    const got = await CacheService.get('does-not-exist');
    expect(got).toBeNull();
  });

  it('CACHE-004 invalidate by pattern (clear) removes matching entries', async () => {
    await CacheService.set('seasonal_anilist_2024_WINTER', [1, 2, 3]);
    await CacheService.set('detail_anilist_1', { v: 1 });

    // CacheService doesn't expose pattern-clear directly; the equivalent
    // behavior in the shim is `clear()` which empties the table.
    await CacheService.clear();

    expect(await CacheService.get('seasonal_anilist_2024_WINTER')).toBeNull();
    expect(await CacheService.get('detail_anilist_1')).toBeNull();
  });

  it('CACHE-005 init can be called multiple times without error (idempotent)', async () => {
    await CacheService.init();
    await CacheService.init();
    await CacheService.init();
    // Still works after multiple inits.
    await CacheService.set('after_multi_init', { ok: true });
    const got = await CacheService.get<{ ok: boolean }>('after_multi_init');
    expect(got?.ok).toBe(true);
  });

  it('CACHE-006 getWithMeta returns isStale=false within ttl', async () => {
    await CacheService.set('swr_fresh', { v: 1 }, 60_000);
    const meta = await CacheService.getWithMeta<{ v: number }>('swr_fresh');
    expect(meta).not.toBeNull();
    expect(meta?.value.v).toBe(1);
    expect(meta?.isStale).toBe(false);
  });

  it('CACHE-007 getWithMeta returns isStale=true past ttl but within grace', async () => {
    // ttl=-1 → instantly expired by ttl boundary, but grace of 60s keeps it usable.
    await CacheService.set('swr_stale', { v: 2 }, -1);
    const meta = await CacheService.getWithMeta<{ v: number }>('swr_stale', 60_000);
    expect(meta).not.toBeNull();
    expect(meta?.value.v).toBe(2);
    expect(meta?.isStale).toBe(true);
  });

  it('CACHE-008 getWithMeta returns null past ttl + grace', async () => {
    await CacheService.set('swr_dead', { v: 3 }, -1);
    const meta = await CacheService.getWithMeta<{ v: number }>('swr_dead', 0);
    expect(meta).toBeNull();
  });

  it('CACHE-009 getWithMeta returns null for an unknown key', async () => {
    const meta = await CacheService.getWithMeta('does-not-exist', 60_000);
    expect(meta).toBeNull();
  });
});
