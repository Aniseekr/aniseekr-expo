import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { KitsuDataSource, __test__ } from '../../../libs/services/data-sources/kitsu-data-source';
import { RateLimiter } from '../../../libs/services/rate-limiter';

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

function makeJsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/vnd.api+json', ...(init.headers ?? {}) },
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

function buildAttrs(extra: Record<string, unknown> = {}) {
  return {
    canonicalTitle: 'Cowboy Bebop',
    titles: { en_jp: 'Cowboy Bebop', ja_jp: 'カウボーイビバップ', en: 'Cowboy Bebop' },
    synopsis: 'Bounty hunters in space.',
    averageRating: '82.4',
    startDate: '1998-04-03',
    subtype: 'TV',
    episodeCount: 26,
    posterImage: {
      large: 'https://media.kitsu.io/anime/poster/1/large.jpg',
      original: 'https://media.kitsu.io/anime/poster/1/original.jpg',
    },
    coverImage: {
      large: 'https://media.kitsu.io/anime/cover/1/large.jpg',
    },
    ...extra,
  };
}

describe('KitsuDataSource', () => {
  let source: KitsuDataSource;
  let activeSpy: ReturnType<typeof spyOn> | null = null;

  beforeEach(() => {
    RateLimiter.__resetForTests();
    source = new KitsuDataSource();
  });

  afterEach(() => {
    activeSpy?.mockRestore();
    activeSpy = null;
  });

  it('KITSU-001 includes Accept: application/vnd.api+json on every request', async () => {
    const { spy, calls } = captureFetch([
      makeJsonResponse({ data: { id: '1', type: 'anime', attributes: buildAttrs() } }),
    ]);
    activeSpy = spy;

    await source.fetchAnimeDetail('1');
    expect(calls.length).toBe(1);
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>;
    expect(headers.Accept).toBe('application/vnd.api+json');
  });

  it('KITSU-002 fetchAnimeDetail hits /anime/{id}', async () => {
    const { spy, calls } = captureFetch([
      makeJsonResponse({ data: { id: '7442', type: 'anime', attributes: buildAttrs() } }),
    ]);
    activeSpy = spy;

    const item = await source.fetchAnimeDetail('7442');
    expect(calls[0].url).toContain('https://kitsu.io/api/edge/anime/7442');
    expect(item.title).toBe('Cowboy Bebop');
    expect(item.platformData.kitsu?.id).toBe('7442');
  });

  it('KITSU-003 searchAnime uses filter[text]= param', async () => {
    const { spy, calls } = captureFetch([
      makeJsonResponse({ data: [{ id: '1', type: 'anime', attributes: buildAttrs() }] }),
    ]);
    activeSpy = spy;

    const items = await source.searchAnime('cowboy');
    expect(items.length).toBe(1);
    const url = calls[0].url;
    // Brackets are URL-encoded by URLSearchParams.
    expect(url).toMatch(/filter%5Btext%5D=cowboy/);
    expect(url).toMatch(/page%5Blimit%5D=20/);
  });

  it('KITSU-004 page=2 sets page[offset]=20', async () => {
    const { spy, calls } = captureFetch([makeJsonResponse({ data: [] })]);
    activeSpy = spy;

    await source.searchAnime('q', 2);
    expect(calls[0].url).toMatch(/page%5Boffset%5D=20/);
  });

  it('KITSU-005 fetchTopAnime uses sort=-averageRating', async () => {
    const { spy, calls } = captureFetch([
      makeJsonResponse({ data: [{ id: '1', type: 'anime', attributes: buildAttrs() }] }),
    ]);
    activeSpy = spy;

    await source.fetchTopAnime();
    // The literal `-` must be preserved in the encoded URL.
    expect(calls[0].url).toMatch(/sort=-averageRating/);
  });

  it('KITSU-006 averageRating string parses to a number, null stays null', async () => {
    expect(__test__.parseKitsuScore('82.4')).toBe(82.4);
    expect(__test__.parseKitsuScore(null)).toBeNull();
    expect(__test__.parseKitsuScore('')).toBeNull();
    expect(__test__.parseKitsuScore('not a number')).toBeNull();

    const item = __test__.buildKitsuItem({
      id: '1',
      type: 'anime',
      attributes: buildAttrs({ averageRating: '82.4' }),
    });
    expect(item.anilistScore).toBe(82.4);
    // 0-100 → normalized 0-10.
    expect(item.normalizedScore).toBeCloseTo(8.24, 5);

    const itemNull = __test__.buildKitsuItem({
      id: '2',
      type: 'anime',
      attributes: buildAttrs({ averageRating: null }),
    });
    expect(itemNull.anilistScore).toBeNull();
    expect(itemNull.normalizedScore).toBeNull();
  });
});
