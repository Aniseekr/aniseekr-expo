// Deterministic tests for the Bangumi data source (BGM-001..008).
// BGM-009 is the live integration smoke and lives at
// __tests__/integration/bangumi-live.test.ts.
//
// Strategy:
//   - Mock fetch via spyOn(globalThis, 'fetch'). Each call's URL/headers are
//     captured so we can assert against the spec contract directly.
//   - Inject a stub AniListDataSource into the BangumiDataSource constructor
//     so delegation cases (BGM-006/007/008) don't depend on the AniList file.
//
// The BangumiClient itself goes through the rate limiter; we reset it
// before each test to avoid carrying cooldowns between tests.

import { describe, it, expect, beforeEach, afterEach, spyOn, mock, type Mock } from 'bun:test';
import {
  BangumiDataSource,
  convertSubjectToUnifiedItem,
} from '../../../libs/services/data-sources/bangumi-data-source';
import type {
  AnimeDataSource,
  AnimeGenre,
} from '../../../libs/services/data-sources/anime-data-source';
import { UnifiedAnimeItem } from '../../../libs/models/unified-anime-item';
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

/**
 * Build a stub AniList data source that simply records every call and
 * returns a canned UnifiedAnimeItem array. Tests assert on `mock.calls` to
 * verify delegation happened with the right arguments.
 */
function buildStubAniList(items: UnifiedAnimeItem[] = []): {
  source: AnimeDataSource;
  search: Mock<AnimeDataSource['searchAnime']>;
  top: Mock<AnimeDataSource['fetchTopAnime']>;
  seasonal: Mock<AnimeDataSource['fetchSeasonalAnime']>;
  byGenre: Mock<AnimeDataSource['fetchAnime']>;
  genres: Mock<AnimeDataSource['fetchGenres']>;
} {
  const search = mock(async (_q: string, _p?: number) => items);
  const top = mock(async (_p?: number) => items);
  const seasonal = mock(async (_p?: number, _s?: string, _y?: number) => items);
  const byGenre = mock(async (_p: number, _g?: number) => items);
  const genres = mock(async () => [] as AnimeGenre[]);

  const source: AnimeDataSource = {
    type: 'anilist',
    searchAnime: search,
    fetchTopAnime: top,
    fetchSeasonalAnime: seasonal,
    fetchAnime: byGenre,
    fetchGenres: genres,
    async fetchAnimeDetail(id: string) {
      return new UnifiedAnimeItem({
        title: 'Stub',
        platformData: { anilist: { id } },
      });
    },
    async fetchAnimeStaff() {
      return [];
    },
    async fetchAnimeRelations() {
      return [];
    },
    async fetchAnimeStreaming() {
      return [];
    },
    async fetchAnimeThemes() {
      return null;
    },
    async fetchStatistics() {
      return null;
    },
  };
  return { source, search, top, seasonal, byGenre, genres };
}

const HYOUKA_SUBJECT = {
  id: 7157,
  type: 2,
  name: '氷菓',
  name_cn: '冰菓',
  summary: '一个普通的高中生……',
  date: '2012-04-23',
  platform: 'TV',
  eps: 22,
  total_episodes: 22,
  images: {
    // intentionally http to exercise the https rewrite (BGM-003)
    large: 'http://lain.bgm.tv/pic/cover/l/example.jpg',
    common: 'http://lain.bgm.tv/pic/cover/c/example.jpg',
  },
  rating: { score: 8.2, total: 10000, count: { '10': 1000, '9': 2000 } },
  tags: [{ name: 'ミステリー' }, { name: '京都アニメーション' }],
};

beforeEach(() => {
  RateLimiter.__resetForTests();
});

afterEach(() => {
  // Restore fetch between tests so spies don't bleed.
  // bun:test's mock.restore is per-spy; we rely on the assignment above.
});

describe('BangumiDataSource (BGM-001..008)', () => {
  it('BGM-001 every Bangumi request includes the User-Agent header', async () => {
    const { spy, calls } = captureFetch(() => jsonResponse(HYOUKA_SUBJECT));
    const source = new BangumiDataSource({ skipRateLimit: true });
    await source.fetchAnimeDetail('7157');

    expect(calls.length).toBe(1);
    const headers = calls[0].init?.headers as Record<string, string> | undefined;
    expect(headers).toBeDefined();
    const userAgent = headers && headers['User-Agent'];
    expect(userAgent).toBe('Aniseekr/1.0 (https://github.com/Aniseekr)');
    spy.mockRestore();
  });

  it('BGM-002 fetchAnimeDetail hits /v0/subjects/{id}', async () => {
    const { spy, calls } = captureFetch(() => jsonResponse(HYOUKA_SUBJECT));
    const source = new BangumiDataSource({ skipRateLimit: true });
    await source.fetchAnimeDetail('7157');

    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe('https://api.bgm.tv/v0/subjects/7157');
    expect(calls[0].init?.method).toBe('GET');
    spy.mockRestore();
  });

  it('BGM-003 bgm.tv image URL with http rewritten to https', async () => {
    const { spy } = captureFetch(() => jsonResponse(HYOUKA_SUBJECT));
    const source = new BangumiDataSource({ skipRateLimit: true });
    const item = await source.fetchAnimeDetail('7157');

    // Top-level cover URL is normalized.
    expect(item.coverImageURL?.startsWith('https://')).toBe(true);
    expect(item.coverImageURL).toBe('https://lain.bgm.tv/pic/cover/l/example.jpg');
    // Platform image entry also normalized.
    const bangumiImg = item.platformImages.bangumi;
    expect(bangumiImg?.large?.startsWith('https://')).toBe(true);
    spy.mockRestore();
  });

  it('BGM-004 name_cn is mapped to titleChinese', async () => {
    const { spy } = captureFetch(() => jsonResponse(HYOUKA_SUBJECT));
    const source = new BangumiDataSource({ skipRateLimit: true });
    const item = await source.fetchAnimeDetail('7157');

    expect(item.titleChinese).toBe('冰菓');
    expect(item.titleJapanese).toBe('氷菓');
    spy.mockRestore();
  });

  it('BGM-005 Bangumi name_cn wins as the primary title (over Japanese)', async () => {
    // Pure converter test — independent of HTTP.
    const item = convertSubjectToUnifiedItem({
      id: 1,
      type: 2,
      name: 'Steins;Gate',
      name_cn: '命运石之门',
    });
    // Chinese name wins as `title` per spec.
    expect(item.title).toBe('命运石之门');
    expect(item.titleJapanese).toBe('Steins;Gate');
    expect(item.titleChinese).toBe('命运石之门');

    // Falls back to Japanese name when name_cn is empty.
    const noChinese = convertSubjectToUnifiedItem({
      id: 2,
      type: 2,
      name: 'Cowboy Bebop',
      name_cn: '',
    });
    expect(noChinese.title).toBe('Cowboy Bebop');
    expect(noChinese.titleChinese).toBeNull();
  });

  it('BGM-006 searchAnime delegates to AniList then enriches with Chinese titles', async () => {
    // Make the AniList stub return one item titled "Hyouka" — and have the
    // Bangumi search return a name_cn match for it. Then verify the result
    // is enriched.
    const aniListItem = new UnifiedAnimeItem({
      title: 'Hyouka',
      titleEnglish: 'Hyouka',
      titleJapanese: '氷菓',
      platformData: { anilist: { id: '12189' } },
    });
    const stub = buildStubAniList([aniListItem]);

    const { spy, calls } = captureFetch(() =>
      jsonResponse({
        data: [
          {
            id: 7157,
            type: 2,
            name: '氷菓',
            name_cn: '冰菓',
          },
        ],
      })
    );

    const source = new BangumiDataSource({
      aniListSource: stub.source,
      skipRateLimit: true,
    });
    const items = await source.searchAnime('Hyouka', 2);

    // AniList was called with the same query/page.
    expect(stub.search).toHaveBeenCalledTimes(1);
    expect(stub.search.mock.calls[0]).toEqual(['Hyouka', 2]);

    // Bangumi search was issued for enrichment.
    expect(calls.length).toBe(1);
    expect(calls[0].url.startsWith('https://api.bgm.tv/v0/search/subjects')).toBe(true);
    expect(calls[0].init?.method).toBe('POST');

    // Item is enriched with Chinese title.
    expect(items.length).toBe(1);
    expect(items[0].titleChinese).toBe('冰菓');
    expect(items[0].title).toBe('冰菓');
    spy.mockRestore();
  });

  it('BGM-007 fetchTopAnime delegates to AniList', async () => {
    const item = new UnifiedAnimeItem({
      title: 'Foo',
      titleJapanese: 'Foo',
      platformData: { anilist: { id: '1' } },
    });
    const stub = buildStubAniList([item]);

    // Bangumi enrichment search returns nothing → items pass through.
    const { spy, calls } = captureFetch(() => jsonResponse({ data: [] }));

    const source = new BangumiDataSource({
      aniListSource: stub.source,
      skipRateLimit: true,
    });
    const result = await source.fetchTopAnime(3);

    expect(stub.top).toHaveBeenCalledTimes(1);
    expect(stub.top.mock.calls[0]).toEqual([3]);
    // Per-item enrichment lookup happened for the one returned item.
    expect(calls.length).toBe(1);
    expect(result.length).toBe(1);
    spy.mockRestore();
  });

  it('BGM-008 fetchSeasonalAnime delegates to AniList', async () => {
    const stub = buildStubAniList([]);
    const { spy } = captureFetch(() => jsonResponse({ data: [] }));

    const source = new BangumiDataSource({
      aniListSource: stub.source,
      skipRateLimit: true,
    });
    const result = await source.fetchSeasonalAnime(2, 'WINTER', 2024);

    expect(stub.seasonal).toHaveBeenCalledTimes(1);
    expect(stub.seasonal.mock.calls[0]).toEqual([2, 'WINTER', 2024]);
    // No items so no enrichment happens.
    expect(result).toEqual([]);
    spy.mockRestore();
  });

  it('BGM-008b fetchSeasonalAnime forwards pagination options to delegated AniList source', async () => {
    const stub = buildStubAniList([]);
    const { spy } = captureFetch(() => jsonResponse({ data: [] }));

    const source = new BangumiDataSource({
      aniListSource: stub.source,
      skipRateLimit: true,
    });
    await (source.fetchSeasonalAnime as any)(2, 'WINTER', 2024, { perPage: 50 });

    expect(stub.seasonal).toHaveBeenCalledTimes(1);
    expect(stub.seasonal.mock.calls[0]).toEqual([2, 'WINTER', 2024, { perPage: 50 }]);
    spy.mockRestore();
  });
});
