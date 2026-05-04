/**
 * Deterministic unit tests for `JikanDataSource`.
 *
 * Spec cases: MAL-001, MAL-002, MAL-003, MAL-004, MAL-005, MAL-006, MAL-007,
 * MAL-008, MAL-009.
 *
 * All HTTP is mocked. The data source is wired to a `JikanClient` instance
 * with a fake `fetch` and a no-op `sleep` so backoff loops don't burn wall
 * time.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { JikanClient } from '../../../libs/clients/jikan-client';
import { JikanDataSource } from '../../../libs/services/data-sources/jikan-data-source';
import { dataSourceConfig, DataSourceConfig } from '../../../libs/services/data-source-config';
import { rateLimiter } from '../../../libs/services/rate-limiter';
import { DataSourceError } from '../../../libs/services/data-sources/data-source-error';

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

function fakeJson(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function buildSubject(handler: (call: FetchCall, attempt: number) => Response | Promise<Response>) {
  // The data source layer (and the JikanClient) reach the rate limiter via
  // the singleton `rateLimiter` constant captured at module load. Reset its
  // state and route both `now` and `sleep` through no-ops so the test never
  // burns wall time during 429 backoff loops.
  rateLimiter.reset();
  rateLimiter.__setTimeFunctions(
    () => 0,
    async () => undefined
  );

  const calls: FetchCall[] = [];
  let attempt = 0;
  const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
    attempt++;
    const call: FetchCall = { url: String(url), init };
    calls.push(call);
    return await handler(call, attempt);
  });

  const client = new JikanClient({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep: async () => undefined,
  });
  const ds = new JikanDataSource(client);
  return { ds, client, calls, fetchImpl };
}

const baseAnime = (overrides: Record<string, unknown> = {}) => ({
  mal_id: 1,
  title: 'Cowboy Bebop',
  title_english: 'Cowboy Bebop',
  title_japanese: 'カウボーイビバップ',
  type: 'TV',
  episodes: 26,
  score: 8.78,
  year: 1998,
  season: 'spring',
  synopsis: 'In the year 2071…',
  images: {
    jpg: { image_url: 'https://x/jpg-small.jpg', large_image_url: 'https://x/jpg.jpg' },
    webp: { image_url: 'https://x/webp-small.webp', large_image_url: 'https://x/webp.webp' },
  },
  genres: [{ mal_id: 1, name: 'Action' }],
  themes: [{ mal_id: 1, name: 'Space' }],
  demographics: [{ mal_id: 1, name: 'Seinen' }],
  studios: [{ mal_id: 14, name: 'Sunrise' }],
  broadcast: { day: 'Saturdays' },
  aired: { from: '1998-04-03T00:00:00+00:00' },
  ...overrides,
});

describe('JikanDataSource', () => {
  beforeEach(async () => {
    rateLimiter.reset();
    DataSourceConfig.__resetForTests();
    // SFW defaults to true (allowR18Content == false). Init is required so
    // `dataSourceConfig.allowR18Content` is wired to the AsyncStorage shim.
    await dataSourceConfig.init();
  });

  afterEach(() => {
    mock.restore();
    rateLimiter.reset();
    DataSourceConfig.__resetForTests();
  });

  it('MAL-001 fetchAnimeDetail GETs /anime/{id} and maps mal_id to platform data', async () => {
    const { ds, calls } = buildSubject(() => fakeJson({ data: baseAnime({ mal_id: 1 }) }));

    const item = await ds.fetchAnimeDetail('1');

    expect(item.title).toBe('Cowboy Bebop');
    expect(item.idMal).toBe(1);
    expect(item.platformData.myanimelist?.id).toBe('1');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.jikan.moe/v4/anime/1');
  });

  it('MAL-002 searchAnime GETs /anime?q=… with the query string', async () => {
    const { ds, calls } = buildSubject(() => fakeJson({ data: [baseAnime({ mal_id: 1 })] }));

    const results = await ds.searchAnime('cowboy', 2);
    expect(results).toHaveLength(1);

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe('/v4/anime');
    expect(url.searchParams.get('q')).toBe('cowboy');
    expect(url.searchParams.get('page')).toBe('2');
  });

  it('MAL-003 appends ?sfw=true when allowR18Content is false (default)', async () => {
    const { ds, calls } = buildSubject(() => fakeJson({ data: [] }));

    await ds.searchAnime('idol', 1);

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.searchParams.get('sfw')).toBe('true');

    // Toggle off and re-fetch — sfw should disappear.
    await dataSourceConfig.setAllowR18Content(true);
    await ds.searchAnime('idol', 1);

    expect(calls).toHaveLength(2);
    expect(new URL(calls[1].url).searchParams.get('sfw')).toBeNull();
  });

  it('MAL-004 fetchTopAnime GETs /top/anime?page=', async () => {
    const { ds, calls } = buildSubject(() => fakeJson({ data: [baseAnime({ mal_id: 1 })] }));

    await ds.fetchTopAnime(3);

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe('/v4/top/anime');
    expect(url.searchParams.get('page')).toBe('3');
  });

  it('MAL-005 fetchSeasonalAnime with explicit year and season hits /seasons/{year}/{season}', async () => {
    const { ds, calls } = buildSubject(() => fakeJson({ data: [] }));

    await ds.fetchSeasonalAnime(1, 'spring', 2024);

    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe('/v4/seasons/2024/spring');
  });

  it('MAL-006 fetchSeasonalAnime with no args defaults to /seasons/now', async () => {
    const { ds, calls } = buildSubject(() => fakeJson({ data: [] }));

    await ds.fetchSeasonalAnime();

    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe('/v4/seasons/now');
  });

  it('MAL-007 score field maps to malScore unchanged (0-10)', async () => {
    const { ds } = buildSubject(() => fakeJson({ data: [baseAnime({ mal_id: 1, score: 8.78 })] }));

    const [item] = await ds.searchAnime('cowboy', 1);
    expect(item.malScore).toBe(8.78);
    // No anilistScore present, so normalizedScore equals the raw mal value.
    expect(item.normalizedScore).toBe(8.78);
  });

  it('MAL-008 webp.large_image_url is preferred over jpg.large_image_url', async () => {
    const { ds } = buildSubject(() =>
      fakeJson({
        data: [
          baseAnime({
            mal_id: 1,
            images: {
              jpg: { large_image_url: 'https://x/jpg.jpg' },
              webp: { large_image_url: 'https://x/webp.webp' },
            },
          }),
        ],
      })
    );

    const [item] = await ds.searchAnime('x', 1);
    expect(item.coverImageURL).toBe('https://x/webp.webp');
    expect(item.platformImages.myanimelist?.large).toBe('https://x/webp.webp');
  });

  it('MAL-009 429 backoff retries up to 3 times then succeeds (4 total fetches)', async () => {
    let throwCount = 0;
    const { ds, calls } = buildSubject(() => {
      throwCount++;
      if (throwCount <= 2) {
        return fakeJson({ status: 429, message: 'rate limited' }, 429, { 'Retry-After': '1' });
      }
      return fakeJson({ data: baseAnime({ mal_id: 1 }) });
    });

    const item = await ds.fetchAnimeDetail('1');
    expect(item.title).toBe('Cowboy Bebop');
    expect(calls).toHaveLength(3); // 2 x 429, then 1 success
    expect(throwCount).toBe(3);
  });

  it('MAL-009b 429 over the retry budget surfaces RATE_LIMITED error', async () => {
    const { ds, calls } = buildSubject(() =>
      fakeJson({ message: 'rate limited' }, 429, { 'Retry-After': '1' })
    );

    let caught: unknown;
    try {
      await ds.fetchAnimeDetail('1');
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(DataSourceError);
    expect((caught as DataSourceError).code).toBe('RATE_LIMITED');
    // 4 attempts total (initial + 3 retries).
    expect(calls).toHaveLength(4);
  });

  it('Detail mapping: tags are themes ∪ demographics deduped', async () => {
    const { ds } = buildSubject(() =>
      fakeJson({
        data: baseAnime({
          themes: [{ mal_id: 1, name: 'Space' }],
          demographics: [
            { mal_id: 1, name: 'Seinen' },
            { mal_id: 2, name: 'Space' },
          ],
        }),
      })
    );

    const item = await ds.fetchAnimeDetail('1');
    expect(item.tags.sort()).toEqual(['Seinen', 'Space']);
  });

  it('Detail mapping: broadcastDay "Unknown" becomes null', async () => {
    const { ds } = buildSubject(() =>
      fakeJson({ data: baseAnime({ broadcast: { day: 'Unknown' } }) })
    );

    const item = await ds.fetchAnimeDetail('1');
    expect(item.broadcastDay).toBeNull();
  });

  it('Detail mapping: season string lowercase becomes UPPERCASE', async () => {
    const { ds } = buildSubject(() => fakeJson({ data: baseAnime({ season: 'spring' }) }));

    const item = await ds.fetchAnimeDetail('1');
    expect(item.season).toBe('SPRING');
  });

  it('fetchStatistics returns PlatformRatingData with status distribution keys', async () => {
    const { ds } = buildSubject(() =>
      fakeJson({
        data: {
          watching: 100,
          completed: 200,
          on_hold: 10,
          dropped: 5,
          plan_to_watch: 50,
          total: 365,
          scores: [
            { score: 10, votes: 50, percentage: 13.7 },
            { score: 9, votes: 100, percentage: 27.4 },
          ],
        },
      })
    );

    const stats = await ds.fetchStatistics('1');
    expect(stats).not.toBeNull();
    expect(stats?.scoredBy).toBe(365);
    expect(stats?.ratingDistribution?.['status:watching']).toBe(100);
    expect(stats?.ratingDistribution?.['status:completed']).toBe(200);
    expect(stats?.ratingDistribution?.['status:onHold']).toBe(10);
    expect(stats?.ratingDistribution?.['status:dropped']).toBe(5);
    expect(stats?.ratingDistribution?.['status:planToWatch']).toBe(50);
    expect(stats?.ratingDistribution?.['status:total']).toBe(365);
    expect(stats?.ratingDistribution?.['10']).toBe(50);
    expect(stats?.ratingDistribution?.['9']).toBe(100);
  });
});
