import { describe, it, expect, beforeEach } from 'bun:test';
import { CacheService } from '../../libs/services/cache-service';
import { CacheManager, type CacheBucket } from '../../libs/services/cache/cache-manager';
import { MetadataBucket } from '../../libs/services/cache/buckets/metadata-bucket';

class FakeBucket implements CacheBucket {
  id: string;
  label: string;
  description = 'fake';
  cleared = 0;
  pruned = 0;
  prunedRemoved = 0;

  constructor(id: string, label: string, prunedRemoved = 0) {
    this.id = id;
    this.label = label;
    this.prunedRemoved = prunedRemoved;
  }

  async getStats() {
    return { entries: 1, bytes: 100 };
  }

  async clear() {
    this.cleared += 1;
  }

  async prune() {
    this.pruned += 1;
    return { removed: this.prunedRemoved };
  }
}

describe('CacheManager', () => {
  beforeEach(async () => {
    await CacheService.init();
    await CacheService.clear();
    CacheManager.__resetForTests();
  });

  it('CM-001 getInstance returns the same instance', () => {
    const a = CacheManager.getInstance();
    const b = CacheManager.getInstance();
    expect(a).toBe(b);
  });

  it('CM-002 default registration includes metadata / image / runtime buckets', () => {
    const manager = CacheManager.getInstance();
    const ids = manager.getBuckets().map((b) => b.id);
    expect(ids).toContain('metadata');
    expect(ids).toContain('image.disk');
    expect(ids).toContain('image.memory');
    expect(ids).toContain('runtime_files');
  });

  it('CM-003 register / unregister buckets', () => {
    const manager = CacheManager.getInstance();
    const fake = new FakeBucket('fake', 'Fake');
    manager.register(fake);
    expect(manager.getBucket('fake')).toBe(fake);
    manager.unregister('fake');
    expect(manager.getBucket('fake')).toBeUndefined();
  });

  it('CM-004 register replaces same-id bucket and warns', () => {
    const manager = CacheManager.getInstance();
    const a = new FakeBucket('dup', 'A');
    const b = new FakeBucket('dup', 'B');
    manager.register(a);
    manager.register(b);
    expect(manager.getBucket('dup')).toBe(b);
    // Only one entry remains.
    expect(manager.getBuckets().filter((bk) => bk.id === 'dup').length).toBe(1);
  });

  it('CM-005 getStats aggregates per bucket and isolates failures', async () => {
    const manager = CacheManager.getInstance();
    const fake = new FakeBucket('ok', 'OK');
    manager.register(fake);
    const broken: CacheBucket = {
      id: 'broken',
      label: 'Broken',
      async getStats() {
        throw new Error('boom');
      },
      async clear() {},
    };
    manager.register(broken);

    const stats = await manager.getStats();
    expect(stats.ok).toEqual({ entries: 1, bytes: 100 });
    expect(stats.broken).toEqual({ entries: 0, bytes: 0 });
  });

  it('CM-006 clearAll calls clear on every bucket even if one throws', async () => {
    const manager = CacheManager.getInstance();
    const a = new FakeBucket('a', 'A');
    const c = new FakeBucket('c', 'C');
    manager.register(a);
    manager.register({
      id: 'b',
      label: 'B',
      async getStats() {
        return { entries: 0, bytes: 0 };
      },
      async clear() {
        throw new Error('boom');
      },
    });
    manager.register(c);

    await manager.clearAll();
    expect(a.cleared).toBe(1);
    expect(c.cleared).toBe(1);
  });

  it('CM-007 pruneAll skips buckets without prune and sums removed', async () => {
    const manager = CacheManager.getInstance();
    const noPrune: CacheBucket = {
      id: 'no_prune',
      label: 'NoPrune',
      async getStats() {
        return { entries: 0, bytes: 0 };
      },
      async clear() {},
    };
    const a = new FakeBucket('a', 'A', 3);
    const b = new FakeBucket('b', 'B', 5);
    manager.register(noPrune);
    manager.register(a);
    manager.register(b);

    const result = await manager.pruneAll();
    expect(result.totalRemoved).toBe(8);
    expect(a.pruned).toBe(1);
    expect(b.pruned).toBe(1);
  });

  it('CM-008 getStorageOverview returns numeric fields', async () => {
    const manager = CacheManager.getInstance();
    const overview = await manager.getStorageOverview();
    expect(typeof overview.cacheDirBytes).toBe('number');
    expect(typeof overview.documentDirBytes).toBe('number');
    expect(typeof overview.availableDiskBytes).toBe('number');
    expect(typeof overview.totalDiskBytes).toBe('number');
  });
});

describe('MetadataBucket', () => {
  beforeEach(async () => {
    await CacheService.init();
    await CacheService.clear();
  });

  it('MB-001 reports stats spanning every metadata prefix', async () => {
    await CacheService.set('anime_detail_1', { v: 1 });
    await CacheService.set('anime_detail_2', { v: 2 });
    await CacheService.set('search_x', [1]);

    const bucket = new MetadataBucket();
    const stats = await bucket.getStats();
    expect(stats.entries).toBe(3);
    expect(stats.bytes).toBeGreaterThan(0);
  });

  it('MB-002 children expose only non-empty groups + clear is scoped', async () => {
    await CacheService.set('anime_detail_1', { v: 1 });
    await CacheService.set('anime_detail_2', { v: 2 });
    await CacheService.set('search_x', [1]);

    const bucket = new MetadataBucket();
    const children = await bucket.getChildren();
    const ids = children.map((c) => c.id);
    expect(ids).toContain('metadata.anime_detail');
    expect(ids).toContain('metadata.search');
    expect(ids).not.toContain('metadata.seasonal');  // empty group hidden

    const detail = children.find((c) => c.id === 'metadata.anime_detail')!;
    await detail.clear();
    expect(await CacheService.get('anime_detail_1')).toBeNull();
    expect(await CacheService.get('anime_detail_2')).toBeNull();
    expect(await CacheService.get<number[]>('search_x')).not.toBeNull();
  });

  it('MB-003 misc child appears for unknown prefixes and clears only those', async () => {
    await CacheService.set('anime_detail_1', { v: 1 });
    await CacheService.set('weird_orphan', { v: 2 });

    const bucket = new MetadataBucket();
    const children = await bucket.getChildren();
    const misc = children.find((c) => c.id === 'metadata.misc');
    expect(misc).toBeTruthy();
    expect(misc?.stats.entries).toBe(1);

    await misc!.clear();
    expect(await CacheService.get('weird_orphan')).toBeNull();
    expect(await CacheService.get('anime_detail_1')).not.toBeNull();
  });

  it('MB-004 prune drops expired metadata rows', async () => {
    await CacheService.set('anime_detail_alive', { v: 1 }, 60_000);
    await CacheService.set('anime_detail_dead', { v: 2 }, -1);

    const bucket = new MetadataBucket();
    const result = await bucket.prune();
    expect(result.removed).toBe(1);
    expect(await CacheService.get('anime_detail_alive')).not.toBeNull();
    expect(await CacheService.get('anime_detail_dead')).toBeNull();
  });
});
