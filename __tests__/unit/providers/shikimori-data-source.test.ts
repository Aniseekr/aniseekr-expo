import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { ShikimoriDataSource } from '../../../libs/services/data-sources/shikimori-data-source';
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

function buildShikimoriListItem(extra: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Cowboy Bebop',
    russian: 'Ковбой Бибоп',
    image: {
      original: '/uploads/preview/animes/1.jpg',
      preview: '/uploads/preview/animes/1.jpg',
      x96: '/uploads/x96/animes/1.jpg',
      x48: '/uploads/x48/animes/1.jpg',
    },
    url: '/animes/1',
    kind: 'tv',
    score: '8.78',
    status: 'released',
    episodes: 26,
    episodes_aired: 26,
    aired_on: '1998-04-03',
    released_on: '1999-04-24',
    ...extra,
  };
}

describe('ShikimoriDataSource', () => {
  let source: ShikimoriDataSource;
  let activeSpy: ReturnType<typeof spyOn> | null = null;

  beforeEach(() => {
    RateLimiter.__resetForTests();
    source = new ShikimoriDataSource();
  });

  afterEach(() => {
    activeSpy?.mockRestore();
    activeSpy = null;
  });

  it('SHIK-001 sends the User-Agent header on every request', async () => {
    const { spy, calls } = captureFetch([makeJsonResponse([buildShikimoriListItem()])]);
    activeSpy = spy;

    await source.searchAnime('cowboy');
    expect(calls.length).toBe(1);
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>;
    // Shikimori 403s requests without a UA — the header must be present.
    expect(headers['User-Agent']).toBe('Aniseekr/1.0');
  });

  it('SHIK-002 fetchAnimeDetail hits /animes/{id}', async () => {
    const { spy, calls } = captureFetch([
      makeJsonResponse({
        ...buildShikimoriListItem(),
        english: ['Cowboy Bebop'],
        japanese: ['カウボーイビバップ'],
        description: '[b]Bounty hunters[/b] in <i>space</i>.',
        myanimelist_id: 1,
        genres: [{ id: 1, name: 'Action', russian: 'Экшен', kind: 'genre' }],
        studios: [{ id: 1, name: 'Sunrise', filtered_name: 'Sunrise', real: true }],
      }),
    ]);
    activeSpy = spy;

    const item = await source.fetchAnimeDetail('1');
    expect(calls[0].url).toBe('https://shikimori.one/api/animes/1');
    expect(item.platformData.shikimori?.id).toBe('1');
    expect(item.idMal).toBe(1);
    // BBCode + HTML must both be stripped.
    expect(item.synopsis).toBe('Bounty hunters in space.');
    expect(item.genres).toContain('Action');
    expect(item.studios).toContain('Sunrise');
    expect(item.format).toBe('TV');
  });

  it('SHIK-003 prefixes a relative image URL with https://shikimori.one', async () => {
    const { spy } = captureFetch([
      makeJsonResponse([
        buildShikimoriListItem({
          image: {
            original: '/uploads/preview/animes/1.jpg',
            preview: '/uploads/preview/animes/1.jpg',
            x96: '',
            x48: '',
          },
        }),
      ]),
      makeJsonResponse([
        buildShikimoriListItem({
          id: 2,
          image: {
            original: '/assets/globals/missing/main_50x70.png',
            preview: '/assets/globals/missing/preview_160x230.png',
            x96: '',
            x48: '',
          },
        }),
      ]),
    ]);
    activeSpy = spy;

    const items = await source.searchAnime('cb');
    expect(items.length).toBe(1);
    expect(items[0].coverImageURL).toBe('https://shikimori.one/uploads/preview/animes/1.jpg');

    // /missing/ paths are treated as null (Shikimori's not-found placeholder).
    const items2 = await source.searchAnime('missing');
    expect(items2[0].coverImageURL).toBeNull();
  });

  it('SHIK-004 maps russian field to titleRussian', async () => {
    const { spy } = captureFetch([
      makeJsonResponse([buildShikimoriListItem({ russian: 'Ковбой Бибоп' })]),
    ]);
    activeSpy = spy;

    const items = await source.searchAnime('cb');
    expect(items[0].titleRussian).toBe('Ковбой Бибоп');
    expect(items[0].titleRomaji).toBe('Cowboy Bebop');
  });

  it('SHIK-005 fetchTopAnime uses order=ranked', async () => {
    const { spy, calls } = captureFetch([makeJsonResponse([buildShikimoriListItem()])]);
    activeSpy = spy;

    await source.fetchTopAnime();
    expect(calls[0].url).toMatch(/order=ranked/);
    expect(calls[0].url).toMatch(/limit=20/);
  });
});
