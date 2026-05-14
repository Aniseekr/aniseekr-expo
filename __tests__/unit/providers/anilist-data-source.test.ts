/**
 * Deterministic unit tests for `AniListDataSource`.
 *
 * Spec cases: ANIL-001, ANIL-002, ANIL-003, ANIL-004, ANIL-005, ANIL-006,
 * ANIL-007, ANIL-008, ANIL-009.
 *
 * All HTTP is mocked. Each test asserts both:
 *   - the GraphQL query/variables sent to AniList match the contract
 *   - the response is mapped to the expected `UnifiedAnimeItem` shape
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { AniListClient } from '../../../libs/clients/anilist-client';
import { AniListDataSource } from '../../../libs/services/data-sources/anilist-data-source';
import { rateLimiter } from '../../../libs/services/rate-limiter';

interface FetchCall {
  url: string;
  init: RequestInit;
  parsedBody: { query: string; variables: Record<string, unknown> };
}

function fakeJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Wire up an `AniListDataSource` with a mocked fetch and a virtual-time
 * rate-limiter so the test never sleeps for real.
 */
function buildSubject(handler: (call: FetchCall) => Response | Promise<Response>) {
  rateLimiter.reset();
  rateLimiter.__setTimeFunctions(
    () => 0,
    async () => undefined
  );

  const calls: FetchCall[] = [];

  const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
    const body = (init?.body as string) ?? '';
    let parsed: { query: string; variables: Record<string, unknown> };
    try {
      parsed = JSON.parse(body) as {
        query: string;
        variables: Record<string, unknown>;
      };
    } catch {
      parsed = { query: '', variables: {} };
    }
    const call: FetchCall = {
      url: String(url),
      init: init ?? {},
      parsedBody: parsed,
    };
    calls.push(call);
    return await handler(call);
  });

  const client = new AniListClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
  const ds = new AniListDataSource(client);
  return { ds, calls, fetchImpl };
}

describe('AniListDataSource', () => {
  beforeEach(() => {
    rateLimiter.reset();
  });

  afterEach(() => {
    mock.restore();
    rateLimiter.reset();
  });

  it('ANIL-001 search response maps to UnifiedAnimeItem array with title fallback', async () => {
    const { ds, calls } = buildSubject(() =>
      fakeJson({
        data: {
          Page: {
            media: [
              {
                id: 1,
                idMal: 100,
                title: {
                  romaji: 'Cowboy Bebop',
                  english: 'Cowboy Bebop',
                  native: 'カウボーイビバップ',
                },
                coverImage: { large: 'https://img/large.jpg', extraLarge: 'https://img/xl.jpg' },
                bannerImage: 'https://img/banner.jpg',
                averageScore: 86,
                genres: ['Action'],
                tags: [{ name: 'Space', isMediaSpoiler: false }],
                studios: { nodes: [{ name: 'Sunrise', isAnimationStudio: true }] },
              },
              {
                id: 2,
                idMal: null,
                title: { romaji: 'Trigun', english: null, native: 'トライガン' },
                coverImage: null,
                bannerImage: null,
                averageScore: 80,
                genres: [],
                tags: [],
                studios: { nodes: [] },
              },
            ],
          },
        },
      })
    );

    const items = await ds.searchAnime('cowboy', 1);

    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('Cowboy Bebop');
    expect(items[0].titleRomaji).toBe('Cowboy Bebop');
    expect(items[0].titleJapanese).toBe('カウボーイビバップ');
    expect(items[0].idMal).toBe(100);
    expect(items[0].platformImages.anilist?.large).toBe('https://img/large.jpg');
    expect(items[0].platformImages.anilist?.banner).toBe('https://img/banner.jpg');
    expect(items[0].studios).toEqual(['Sunrise']);
    expect(items[1].title).toBe('Trigun');
    expect(items[1].coverImageURL).toBeNull();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://graphql.anilist.co');
    expect(calls[0].parsedBody.query).toContain('media(search: $search');
    expect(calls[0].parsedBody.variables).toMatchObject({ search: 'cowboy', page: 1 });
  });

  it('ANIL-002 fetchAnimeDetail with sourcePlatform=anilist sends id variable', async () => {
    const { ds, calls } = buildSubject(() =>
      fakeJson({
        data: {
          Media: {
            id: 1,
            idMal: 1,
            title: { romaji: 'Cowboy Bebop' },
            coverImage: { large: 'https://x' },
            bannerImage: null,
            averageScore: 86,
            genres: [],
            tags: [],
            studios: { nodes: [] },
          },
        },
      })
    );

    const item = await ds.fetchAnimeDetail('1', 'anilist');

    expect(item.title).toBe('Cowboy Bebop');
    expect(calls).toHaveLength(1);
    expect(calls[0].parsedBody.variables).toEqual({ id: 1 });
    expect(calls[0].parsedBody.variables).not.toHaveProperty('idMal');
  });

  it('ANIL-003 fetchAnimeDetail with sourcePlatform=myanimelist sends idMal variable', async () => {
    const { ds, calls } = buildSubject(() =>
      fakeJson({
        data: {
          Media: {
            id: 99,
            idMal: 42,
            title: { romaji: 'Some Show' },
            coverImage: { large: 'https://x' },
            bannerImage: null,
            averageScore: null,
            genres: [],
            tags: [],
            studios: { nodes: [] },
          },
        },
      })
    );

    const item = await ds.fetchAnimeDetail('42', 'myanimelist');

    expect(item.title).toBe('Some Show');
    expect(calls).toHaveLength(1);
    expect(calls[0].parsedBody.variables).toEqual({ idMal: 42 });
  });

  it('ANIL-004 maps title.english to titleEnglish (preserves all language slots)', async () => {
    const { ds } = buildSubject(() =>
      fakeJson({
        data: {
          Page: {
            media: [
              {
                id: 1,
                idMal: 1,
                title: {
                  romaji: 'Hyouka',
                  english: 'Hyouka',
                  native: '氷菓',
                  userPreferred: '氷菓',
                },
                coverImage: { large: 'x' },
                bannerImage: null,
                averageScore: 80,
                genres: [],
                tags: [],
                studios: { nodes: [] },
              },
            ],
          },
        },
      })
    );

    const items = await ds.searchAnime('hyouka', 1);
    expect(items[0].titleEnglish).toBe('Hyouka');
    expect(items[0].titleJapanese).toBe('氷菓');
    expect(items[0].titleRomaji).toBe('Hyouka');
    // userPreferred populates the canonical `title`.
    expect(items[0].title).toBe('氷菓');
  });

  it('ANIL-005 maps averageScore to anilistScore as raw 0-100 (no division)', async () => {
    const { ds } = buildSubject(() =>
      fakeJson({
        data: {
          Page: {
            media: [
              {
                id: 1,
                idMal: 1,
                title: { romaji: 'A' },
                coverImage: { large: 'x' },
                bannerImage: null,
                averageScore: 85,
                genres: [],
                tags: [],
                studios: { nodes: [] },
              },
            ],
          },
        },
      })
    );

    const [item] = await ds.searchAnime('a', 1);
    expect(item.anilistScore).toBe(85);
    // normalizedScore divides by 10 because raw > 10.
    expect(item.normalizedScore).toBe(8.5);
  });

  it('ANIL-006 strips HTML tags from description into synopsis', async () => {
    const { ds } = buildSubject(() =>
      fakeJson({
        data: {
          Media: {
            id: 1,
            idMal: 1,
            title: { romaji: 'X' },
            coverImage: { large: 'x' },
            bannerImage: null,
            averageScore: 80,
            description: 'Hello<br>world<br><i>and</i> <b>everyone</b>',
            genres: [],
            tags: [],
            studios: { nodes: [] },
          },
        },
      })
    );

    const item = await ds.fetchAnimeDetail('1', 'anilist');
    expect(item.synopsis).toBe('Helloworldand everyone');
  });

  it('ANIL-007 fetchGenres returns GenreCollection with synthetic ids starting at 1000', async () => {
    const { ds, calls } = buildSubject(() =>
      fakeJson({
        data: { GenreCollection: ['Action', 'Adventure', 'Action', 'Comedy'] },
      })
    );

    const genres = await ds.fetchGenres();

    // Duplicates collapsed; ids stay aligned with original index.
    expect(genres).toEqual([
      { id: 1000, name: 'Action' },
      { id: 1001, name: 'Adventure' },
      { id: 1003, name: 'Comedy' },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].parsedBody.query).toContain('GenreCollection');
  });

  it('ANIL-008 filters out tags flagged isMediaSpoiler == true', async () => {
    const { ds } = buildSubject(() =>
      fakeJson({
        data: {
          Page: {
            media: [
              {
                id: 1,
                idMal: 1,
                title: { romaji: 'X' },
                coverImage: { large: 'x' },
                bannerImage: null,
                averageScore: 80,
                genres: [],
                tags: [
                  { name: 'Time Travel', isMediaSpoiler: false },
                  { name: 'Sister Death', isMediaSpoiler: true },
                  { name: 'School', isMediaSpoiler: false },
                ],
                studios: { nodes: [] },
              },
            ],
          },
        },
      })
    );

    const [item] = await ds.searchAnime('x', 1);
    expect(item.tags).toEqual(['Time Travel', 'School']);
    expect(item.tags).not.toContain('Sister Death');
  });

  it('ANIL-009 fetchSeasonalAnime forwards a perPage override to GraphQL variables', async () => {
    const { ds, calls } = buildSubject(() =>
      fakeJson({
        data: {
          Page: {
            media: [],
          },
        },
      })
    );

    await (ds.fetchSeasonalAnime as any)(1, 'SPRING', 2026, { perPage: 50 });

    expect(calls).toHaveLength(1);
    expect(calls[0].parsedBody.variables).toMatchObject({
      page: 1,
      perPage: 50,
      season: 'SPRING',
      year: 2026,
    });
  });
});
