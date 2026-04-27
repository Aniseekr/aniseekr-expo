import { describe, it, expect, beforeEach } from 'bun:test';
import { QueryClient } from '../../libs/services/query-client';

describe('QueryClient', () => {
  let client: QueryClient;

  beforeEach(() => {
    QueryClient.__resetForTests();
    client = QueryClient.getInstance();
  });

  it('QC-001 fetch returns the fetcher result', async () => {
    const result = await client.fetch('k1', async () => 42);
    expect(result).toBe(42);
  });

  it('QC-002 dedup parallel: two parallel fetches with same key call fetcher once', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      // Yield microtask so the second caller can see us in-flight.
      await Promise.resolve();
      return 'value';
    };
    const [a, b] = await Promise.all([
      client.fetch('shared-key', fetcher),
      client.fetch('shared-key', fetcher),
    ]);
    expect(a).toBe('value');
    expect(b).toBe('value');
    expect(calls).toBe(1);
  });

  it('QC-003 second sequential call within stale time skips fetcher (cache hit)', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return 'v';
    };
    await client.fetch('cached-key', fetcher);
    await client.fetch('cached-key', fetcher);
    expect(calls).toBe(1);
  });

  it('QC-004 second sequential call after stale time invokes fetcher again', async () => {
    let now = 0;
    client.__setNow(() => now);
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return calls;
    };
    const r1 = await client.fetch('stale-key', fetcher, { staleTimeMs: 100 });
    expect(r1).toBe(1);
    // Advance virtual time past the stale window.
    now = 1_000;
    const r2 = await client.fetch('stale-key', fetcher, { staleTimeMs: 100 });
    expect(r2).toBe(2);
    expect(calls).toBe(2);
  });

  it('QC-005 rejected fetcher does not poison cache (next call retries)', async () => {
    let attempts = 0;
    const fetcher = async () => {
      attempts++;
      if (attempts === 1) throw new Error('boom');
      return 'ok';
    };
    await expect(client.fetch('flaky-key', fetcher)).rejects.toThrow('boom');
    const second = await client.fetch('flaky-key', fetcher);
    expect(second).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('QC-006 invalidateForPlatform clears all entries containing the platform name', async () => {
    await client.fetch('seasonal_anilist_2024_WINTER_1', async () => ['a']);
    await client.fetch('seasonal_bangumi_2024_WINTER_1', async () => ['b']);
    await client.fetch({ name: 'detail', params: { source: 'anilist', id: '1' } }, async () => 'd');

    expect(client.has('seasonal_anilist_2024_WINTER_1')).toBe(true);
    expect(client.has('seasonal_bangumi_2024_WINTER_1')).toBe(true);

    client.invalidateForPlatform('anilist');

    expect(client.has('seasonal_anilist_2024_WINTER_1')).toBe(false);
    expect(client.has({ name: 'detail', params: { source: 'anilist', id: '1' } })).toBe(false);
    // Bangumi entry untouched.
    expect(client.has('seasonal_bangumi_2024_WINTER_1')).toBe(true);
  });
});
