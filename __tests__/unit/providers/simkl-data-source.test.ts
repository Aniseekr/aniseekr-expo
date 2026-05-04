import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { SimklDataSource } from '../../../libs/services/data-sources/simkl-data-source';
import { wrapSimklPoster } from '../../../libs/clients/simkl-client';
import { RateLimiter } from '../../../libs/services/rate-limiter';

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

function makeJsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

function captureFetch(responses: Response[]): {
  spy: ReturnType<typeof spyOn>;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  let i = 0;
  const fn = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const response = responses[Math.min(i, responses.length - 1)];
    i++;
    return response.clone();
  });
  const spy = spyOn(globalThis, 'fetch').mockImplementation(fn as unknown as typeof fetch);
  return { spy, calls };
}

function buildSimklSearchItem(extra: Record<string, unknown> = {}) {
  return {
    title: 'Cowboy Bebop',
    en_title: 'Cowboy Bebop',
    year: 1998,
    type: 'anime',
    ids: { simkl: 36603, mal: 1, anilist: 1 },
    anime_type: 'tv',
    poster: '36/36603_w.jpg',
    fanart: '36/36603_b.jpg',
    ep_count: 26,
    status: 'ended',
    ratings: { simkl: { rating: 8.9, votes: 1000 }, mal: { rating: 8.8, votes: 5000 } },
    ...extra,
  };
}

function buildSimklDetail(extra: Record<string, unknown> = {}) {
  return {
    title: 'Cowboy Bebop',
    en_title: 'Cowboy Bebop',
    year: 1998,
    ids: { simkl: 36603, mal: 1, anilist: 1, kitsu: 1 },
    type: 'anime',
    anime_type: 'tv',
    status: 'ended',
    ep_count: 26,
    overview: 'Bounty hunters in space.',
    genres: ['Action', 'Drama'],
    poster: '36/36603_w.jpg',
    fanart: '36/36603_b.jpg',
    first_aired: '1998-04-03',
    ratings: { simkl: { rating: 8.9 }, mal: { rating: 8.8 } },
    ...extra,
  };
}

describe('SimklDataSource', () => {
  let source: SimklDataSource;
  let activeSpy: ReturnType<typeof spyOn> | null = null;

  beforeEach(() => {
    RateLimiter.__resetForTests();
    source = new SimklDataSource(() => new Date('2026-04-28T00:00:00Z'));
  });

  afterEach(() => {
    activeSpy?.mockRestore();
    activeSpy = null;
  });

  it('SIMKL-001 sends the simkl-api-key header on every request', async () => {
    const { spy, calls } = captureFetch([makeJsonResponse(buildSimklDetail())]);
    activeSpy = spy;

    await source.fetchAnimeDetail('36603');
    expect(calls.length).toBe(1);
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>;
    // Header must be present (value may be empty in tests without the env key).
    expect('simkl-api-key' in headers).toBe(true);
    // Simkl additionally requires the key as a query param.
    expect(calls[0].url).toMatch(/client_id=/);
  });

  it('SIMKL-002 fetchAnimeDetail uses /anime/{id} with extended=full', async () => {
    const { spy, calls } = captureFetch([makeJsonResponse(buildSimklDetail())]);
    activeSpy = spy;

    const item = await source.fetchAnimeDetail('36603');
    expect(calls[0].url).toContain('https://api.simkl.com/anime/36603');
    expect(calls[0].url).toMatch(/extended=full/);
    expect(item.title).toBe('Cowboy Bebop');
    expect(item.synopsis).toBe('Bounty hunters in space.');
    expect(item.totalEpisodes).toBe(26);
    expect(item.year).toBe(1998);
  });

  it('SIMKL-003 searchAnime hits /search/anime?q={q}', async () => {
    const { spy, calls } = captureFetch([makeJsonResponse([buildSimklSearchItem()])]);
    activeSpy = spy;

    const items = await source.searchAnime('cowboy');
    expect(calls[0].url).toContain('https://api.simkl.com/search/anime');
    expect(calls[0].url).toMatch(/q=cowboy/);
    expect(calls[0].url).toMatch(/extended=full/);
    expect(items.length).toBe(1);
    expect(items[0].title).toBe('Cowboy Bebop');
  });

  it('SIMKL-004 fetchTopAnime hits /anime/best/{currentYear}', async () => {
    const { spy, calls } = captureFetch([makeJsonResponse([buildSimklSearchItem()])]);
    activeSpy = spy;

    await source.fetchTopAnime();
    expect(calls[0].url).toContain('https://api.simkl.com/anime/best/2026');
    expect(calls[0].url).toMatch(/limit=20/);
  });

  it('SIMKL-004 fetchTopAnime falls back to previous year when current returns []', async () => {
    const { spy, calls } = captureFetch([
      makeJsonResponse([]),
      makeJsonResponse([buildSimklSearchItem()]),
    ]);
    activeSpy = spy;

    const items = await source.fetchTopAnime();
    expect(calls.length).toBe(2);
    expect(calls[0].url).toContain('/anime/best/2026');
    expect(calls[1].url).toContain('/anime/best/2025');
    expect(items.length).toBe(1);
  });

  it('SIMKL-005 captures cross-platform IDs (mal, anilist) into platformData', async () => {
    const { spy } = captureFetch([
      makeJsonResponse(
        buildSimklDetail({
          ids: { simkl: 36603, mal: 1, anilist: 11, kitsu: 7442 },
        })
      ),
    ]);
    activeSpy = spy;

    const item = await source.fetchAnimeDetail('36603');
    expect(item.platformData.simkl?.id).toBe('36603');
    expect(item.platformData.myanimelist?.id).toBe('1');
    expect(item.platformData.anilist?.id).toBe('11');
    expect(item.platformData.kitsu?.id).toBe('7442');
    // idMal must also be captured as a top-level field.
    expect(item.idMal).toBe(1);
  });

  it('SIMKL-006 wraps the poster path in the wsrv proxy', async () => {
    const { spy } = captureFetch([
      makeJsonResponse(buildSimklDetail({ poster: '36/36603_w.jpg' })),
    ]);
    activeSpy = spy;

    const item = await source.fetchAnimeDetail('36603');
    expect(item.coverImageURL).toBe('https://wsrv.nl/?url=https://simkl.in/posters/36/36603_w.jpg');

    // The helper itself should also produce the same URL for direct callers.
    expect(wrapSimklPoster('36/36603_w.jpg')).toBe(
      'https://wsrv.nl/?url=https://simkl.in/posters/36/36603_w.jpg'
    );
    expect(wrapSimklPoster(null)).toBeNull();
  });
});
