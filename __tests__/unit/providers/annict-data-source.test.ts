// Deterministic tests for the Annict data source (ANNICT-001..006).
//
// Strategy:
//   - Mock fetch via spyOn(globalThis, 'fetch') to drive the AnnictClient.
//   - Inject a virtual `now()` into the client so token cache/refresh tests
//     are deterministic without sleeping.
//   - For image-fallback tests, inject a `batchFetchImages` spy on the
//     AnnictDataSource so we can verify batching/dedup without depending on
//     the AniList agent's GraphQL implementation.

import { describe, it, expect, beforeEach, spyOn, mock, type Mock } from 'bun:test';
import {
  AnnictDataSource,
  selectAnnictImage,
  coerceMalId,
} from '../../../libs/services/data-sources/annict-data-source';
import { AnnictClient } from '../../../libs/clients/annict-client';
import { RateLimiter } from '../../../libs/services/rate-limiter';

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

/**
 * Captures every fetch call and yields a programmable handler. Returns the
 * captured calls so tests can assert URL / headers / body.
 */
function captureFetch(handler: (call: FetchCall) => Response | Promise<Response>): {
  spy: Mock<typeof fetch>;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const spy = spyOn(globalThis, 'fetch').mockImplementation((async (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => {
    const url = typeof input === 'string' ? input : input.toString();
    const call = { url, init };
    calls.push(call);
    return handler(call);
  }) as unknown as typeof fetch);
  return { spy, calls };
}

beforeEach(() => {
  RateLimiter.__resetForTests();
});

describe('AnnictClient token cache (ANNICT-001..002)', () => {
  it('ANNICT-001 token is cached and reused within its expiry window', async () => {
    let now = 1_000_000;
    const advance = (ms: number) => {
      now += ms;
    };

    let tokenCalls = 0;
    let workCalls = 0;
    const { spy } = captureFetch((call) => {
      if (call.url.endsWith('/oauth/token')) {
        tokenCalls += 1;
        return jsonResponse({
          access_token: `tok-${tokenCalls}`,
          token_type: 'Bearer',
          expires_in: 3600,
        });
      }
      workCalls += 1;
      return jsonResponse({ works: [], total_count: 0 });
    });

    const client = new AnnictClient({
      now: () => now,
      skipRateLimit: true,
    });
    client.setClientCredentials('cid', 'csecret');

    await client.getWorks({ filterTitle: 'foo' });
    advance(60_000); // 1 minute later — well within 1h expiry minus 60s safety.
    await client.getWorks({ filterTitle: 'bar' });

    // Token endpoint hit exactly once across both API calls.
    expect(tokenCalls).toBe(1);
    expect(workCalls).toBe(2);
    spy.mockRestore();
  });

  it('ANNICT-002 expired token triggers a refresh on the next call', async () => {
    let now = 1_000_000;
    const advance = (ms: number) => {
      now += ms;
    };

    let tokenCalls = 0;
    const { spy } = captureFetch((call) => {
      if (call.url.endsWith('/oauth/token')) {
        tokenCalls += 1;
        return jsonResponse({
          access_token: `tok-${tokenCalls}`,
          token_type: 'Bearer',
          expires_in: 3600, // 1h
        });
      }
      return jsonResponse({ works: [], total_count: 0 });
    });

    const client = new AnnictClient({
      now: () => now,
      skipRateLimit: true,
    });
    client.setClientCredentials('cid', 'csecret');

    await client.getWorks({ filterTitle: 'foo' });
    // Advance past expiresAt - 60s safety: 1h - 60s = 3540s. Jump 3550s.
    advance(3_550_000);
    await client.getWorks({ filterTitle: 'bar' });

    expect(tokenCalls).toBe(2); // refreshed
    spy.mockRestore();
  });
});

describe('AnnictDataSource search & detail (ANNICT-003..004)', () => {
  function buildClientWithToken(handler: (call: FetchCall) => Response | Promise<Response>): {
    client: AnnictClient;
    calls: FetchCall[];
    spy: Mock<typeof fetch>;
  } {
    const { spy, calls } = captureFetch(handler);
    const client = new AnnictClient({
      staticToken: 'test-token',
      skipRateLimit: true,
    });
    return { client, calls, spy };
  }

  it('ANNICT-003 searchAnime hits /v1/works with filter_title query param', async () => {
    const { client, calls, spy } = buildClientWithToken(() =>
      jsonResponse({ works: [], total_count: 0 })
    );
    const ds = new AnnictDataSource({ client });

    await ds.searchAnime('hyouka', 2);

    expect(calls.length).toBe(1);
    const url = calls[0].url;
    expect(url.startsWith('https://api.annict.com/v1/works?')).toBe(true);
    expect(url).toContain('filter_title=hyouka');
    expect(url).toContain('page=2');
    // Bearer header present.
    const headers = calls[0].init?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe('Bearer test-token');
    spy.mockRestore();
  });

  it('ANNICT-004 fetchAnimeDetail hits /v1/works with filter_ids equal to id', async () => {
    const { client, calls, spy } = buildClientWithToken(() =>
      jsonResponse({
        works: [
          {
            id: 12345,
            title: 'テスト作品',
            title_en: 'Test Work',
            mal_anime_id: '999',
            images: {
              recommended_url: 'https://example.com/cover.jpg',
            },
          },
        ],
      })
    );
    const ds = new AnnictDataSource({ client });

    const item = await ds.fetchAnimeDetail('12345');

    expect(calls.length).toBe(1);
    const url = calls[0].url;
    expect(url).toContain('filter_ids=12345');
    expect(item.title).toBe('テスト作品');
    expect(item.platformData.annict?.id).toBe('12345');
    expect(item.idMal).toBe(999);
    expect(item.coverImageURL).toBe('https://example.com/cover.jpg');
    spy.mockRestore();
  });

  it('ANNICT-004 fetchAnimeDetail throws NOT_FOUND when works array is empty', async () => {
    const { client, spy } = buildClientWithToken(() => jsonResponse({ works: [] }));
    const ds = new AnnictDataSource({ client });

    let caught: unknown;
    try {
      await ds.fetchAnimeDetail('999');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect((caught as { code?: string }).code).toBe('NOT_FOUND');
    spy.mockRestore();
  });
});

describe('AnnictDataSource image fallback (ANNICT-005..006)', () => {
  it('ANNICT-005 missing Annict image triggers AniList batch fetch via mal_anime_id', async () => {
    const { spy } = captureFetch(() =>
      jsonResponse({
        works: [
          {
            id: 1,
            title: 'No Image Show',
            mal_anime_id: '777',
            // intentionally no images / empty
            images: { recommended_url: '' },
          },
        ],
      })
    );

    const client = new AnnictClient({
      staticToken: 't',
      skipRateLimit: true,
    });

    const batchFetch = mock(
      async (malIds: number[]) =>
        new Map(malIds.map((id) => [id, `https://anilist.example/${id}.jpg`]))
    );
    const ds = new AnnictDataSource({ client, batchFetchImages: batchFetch });

    const items = await ds.searchAnime('foo');

    // Batch fetch was invoked once with the missing-image MAL id.
    expect(batchFetch).toHaveBeenCalledTimes(1);
    expect(batchFetch.mock.calls[0]?.[0]).toEqual([777]);
    // Resulting item carries the AniList-sourced cover.
    expect(items[0].coverImageURL).toBe('https://anilist.example/777.jpg');
    expect(items[0].platformImages.annict?.large).toBe('https://anilist.example/777.jpg');
    spy.mockRestore();
  });

  it('ANNICT-006 multiple works in same response share ONE AniList batch call (dedup + batch)', async () => {
    const { spy } = captureFetch(() =>
      jsonResponse({
        works: [
          { id: 1, title: 'A', mal_anime_id: 1001, images: { recommended_url: '' } },
          { id: 2, title: 'B', mal_anime_id: 1002, images: { recommended_url: '' } },
          // duplicate MAL id — should still result in a single batch entry.
          { id: 3, title: 'C', mal_anime_id: 1001, images: { recommended_url: '' } },
          // Has its own image — should NOT contribute to the batch.
          {
            id: 4,
            title: 'D',
            mal_anime_id: 1003,
            images: { recommended_url: 'https://example.com/d.jpg' },
          },
          // mal_anime_id == 0 — invalid, skip.
          { id: 5, title: 'E', mal_anime_id: 0, images: { recommended_url: '' } },
        ],
      })
    );

    const client = new AnnictClient({
      staticToken: 't',
      skipRateLimit: true,
    });
    const batchFetch = mock(
      async (malIds: number[]) =>
        new Map(malIds.map((id) => [id, `https://anilist.example/${id}.jpg`]))
    );
    const ds = new AnnictDataSource({ client, batchFetchImages: batchFetch });

    const items = await ds.searchAnime('multi');

    // Exactly one batch call.
    expect(batchFetch).toHaveBeenCalledTimes(1);
    // Batch payload contains 1001 and 1002 (no duplicate, no zero, not 1003
    // which already had an image).
    const malIds = batchFetch.mock.calls[0]?.[0] ?? [];
    expect([...malIds].sort((a, b) => a - b)).toEqual([1001, 1002]);

    // Item 1 (mal 1001) gets fallback image.
    expect(items[0].coverImageURL).toBe('https://anilist.example/1001.jpg');
    // Item 3 (mal 1001 again) shares the same fallback image.
    expect(items[2].coverImageURL).toBe('https://anilist.example/1001.jpg');
    // Item 4 keeps its native Annict image.
    expect(items[3].coverImageURL).toBe('https://example.com/d.jpg');
    // Item 5 (mal 0) has no cover.
    expect(items[4].coverImageURL).toBeNull();
    spy.mockRestore();
  });
});

describe('AnnictDataSource pure helpers', () => {
  it('selectAnnictImage prefers recommended_url and rewrites http→https', () => {
    expect(
      selectAnnictImage({
        id: 1,
        title: 't',
        images: { recommended_url: 'http://example.com/a.jpg' },
      })
    ).toBe('https://example.com/a.jpg');

    expect(
      selectAnnictImage({
        id: 1,
        title: 't',
        images: {
          recommended_url: '',
          facebook: { og_image_url: 'https://example.com/og.jpg' },
        },
      })
    ).toBe('https://example.com/og.jpg');

    expect(selectAnnictImage({ id: 1, title: 't' })).toBeNull();
  });

  it('coerceMalId accepts int, string, and rejects null/empty/invalid', () => {
    expect(coerceMalId(123)).toBe(123);
    expect(coerceMalId('456')).toBe(456);
    expect(coerceMalId(null)).toBeNull();
    expect(coerceMalId('')).toBeNull();
    expect(coerceMalId('abc')).toBeNull();
    expect(coerceMalId(undefined)).toBeNull();
  });
});
