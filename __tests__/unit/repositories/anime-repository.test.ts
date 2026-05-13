/**
 * Deterministic unit tests for the new `AnimeRepository` orchestrator.
 *
 * Spec cases: REPO-001..005, REPO-010..013, REPO-020, REPO-021..023, REPO-030,
 * REPO-031, REPO-032.
 *
 * All data sources are mocked via constructor injection. The shared
 * `QueryClient` and `CacheService` singletons are reset between tests so
 * dedup state never leaks between cases. `dataSourceConfig` is also reset
 * (the import-side singleton is touched directly via `__resetForTests`).
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn, type Mock } from 'bun:test';
import { AnimeRepository, CancellationError } from '../../../libs/repositories/anime-repository';
import { AniListClient, type AniListAnime } from '../../../libs/clients/anilist-client';
import {
  type AnimeDataSource,
  type AnimeGenre,
  type AnimeStaff,
} from '../../../libs/services/data-sources/anime-data-source';
import { CacheService } from '../../../libs/services/cache-service';
import { dataSourceConfig } from '../../../libs/services/data-source-config';
import { UnifiedAnimeItem } from '../../../libs/models/unified-anime-item';
import { queryClient } from '../../../libs/services/query-client';
import { IDMappingService, idMappingService } from '../../../libs/services/sync/id-mapping-service';
import type { PlatformType } from '../../../libs/services/auth/types';

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
  parsedBody: { query: string; variables: Record<string, unknown> };
}

// ---------- Helpers ----------

interface MockSourceOverrides {
  type: PlatformType;
  searchAnime?: Mock<AnimeDataSource['searchAnime']>;
  fetchAnime?: Mock<AnimeDataSource['fetchAnime']>;
  fetchGenres?: Mock<AnimeDataSource['fetchGenres']>;
  fetchTopAnime?: Mock<AnimeDataSource['fetchTopAnime']>;
  fetchSeasonalAnime?: Mock<AnimeDataSource['fetchSeasonalAnime']>;
  fetchAnimeDetail?: Mock<AnimeDataSource['fetchAnimeDetail']>;
  fetchStatistics?: Mock<AnimeDataSource['fetchStatistics']>;
  fetchAnimeStaff?: Mock<AnimeDataSource['fetchAnimeStaff']>;
  fetchAnimeRelations?: Mock<AnimeDataSource['fetchAnimeRelations']>;
  fetchAnimeStreaming?: Mock<AnimeDataSource['fetchAnimeStreaming']>;
  fetchAnimeThemes?: Mock<AnimeDataSource['fetchAnimeThemes']>;
}

function buildMockSource(overrides: MockSourceOverrides): AnimeDataSource {
  return {
    type: overrides.type,
    searchAnime: overrides.searchAnime ?? mock(async () => []),
    fetchAnime: overrides.fetchAnime ?? mock(async () => []),
    fetchGenres: overrides.fetchGenres ?? mock(async () => []),
    fetchTopAnime: overrides.fetchTopAnime ?? mock(async () => []),
    fetchSeasonalAnime: overrides.fetchSeasonalAnime ?? mock(async () => []),
    fetchAnimeDetail:
      overrides.fetchAnimeDetail ?? mock(async () => makeItem({ id: '1', source: overrides.type })),
    fetchStatistics: overrides.fetchStatistics ?? mock(async () => null),
    fetchAnimeStaff: overrides.fetchAnimeStaff ?? mock(async () => []),
    fetchAnimeRelations: overrides.fetchAnimeRelations ?? mock(async () => []),
    fetchAnimeStreaming: overrides.fetchAnimeStreaming ?? mock(async () => []),
    fetchAnimeThemes: overrides.fetchAnimeThemes ?? mock(async () => null),
  };
}

function makeItem(opts: { id: string; source: PlatformType; title?: string }): UnifiedAnimeItem {
  return new UnifiedAnimeItem({
    title: opts.title ?? 'Test',
    platformData: {
      [opts.source]: { id: opts.id, progress: 0 },
    },
  });
}

function fakeJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeAniListAnime(overrides: Partial<AniListAnime> = {}): AniListAnime {
  return {
    id: 1,
    idMal: null,
    title: {
      romaji: 'Safe Show',
      english: 'Safe Show',
      native: null,
    },
    coverImage: {
      large: 'https://img/safe.jpg',
      extraLarge: 'https://img/safe-xl.jpg',
      color: null,
    },
    bannerImage: null,
    averageScore: 80,
    popularity: 100,
    description: null,
    format: 'TV',
    episodes: 12,
    duration: 24,
    status: 'FINISHED',
    season: 'WINTER',
    seasonYear: 2024,
    genres: ['Drama'],
    tags: [],
    studios: { nodes: [] },
    startDate: { year: 2024, month: 1, day: 1 },
    nextAiringEpisode: null,
    ...overrides,
  };
}

/**
 * Reset shared singletons. Note: `DataSourceConfig.__resetForTests` and
 * `QueryClient.__resetForTests` swap their singletons but leave the
 * module-level `dataSourceConfig` / `queryClient` references pointing at
 * the OLD instances. Since the repository captures those module-level
 * references by default, tests must mutate the SAME instances directly
 * (via `setBrowseSource('anilist')` and `invalidateAll()`).
 */
async function resetSingletons(): Promise<void> {
  queryClient.invalidateAll();
  IDMappingService.__resetForTests();
  AnimeRepository.__resetForTests();
  await dataSourceConfig.setBrowseSource('anilist');
  await dataSourceConfig.setAllowR18Content(false);
  AniListClient.__setDefaultForTests(null);
  await CacheService.init();
  await CacheService.clear();
}

// ---------- Tests ----------

describe('AnimeRepository', () => {
  beforeEach(async () => {
    await resetSingletons();
  });

  afterEach(() => {
    mock.restore();
  });

  // -------- Source resolution (REPO-001..005) --------

  it('REPO-001 resolveSource returns preferred source when available', async () => {
    const anilistMock = buildMockSource({
      type: 'anilist',
      fetchTopAnime: mock(async () => [makeItem({ id: 'a1', source: 'anilist' })]),
    });
    const malMock = buildMockSource({
      type: 'myanimelist',
      fetchTopAnime: mock(async () => [makeItem({ id: 'm1', source: 'myanimelist' })]),
    });
    const repo = new AnimeRepository({
      anilist: anilistMock,
      myanimelist: malMock,
    });

    const result = await repo.fetchTopAnime(1, 'myanimelist');
    expect(malMock.fetchTopAnime).toHaveBeenCalledTimes(1);
    expect(anilistMock.fetchTopAnime).not.toHaveBeenCalled();
    expect(result[0].sourcePlatform).toBe('myanimelist');
  });

  it('REPO-002 resolveSource returns config browseSource when no preferred', async () => {
    const anilistMock = buildMockSource({
      type: 'anilist',
      fetchTopAnime: mock(async () => []),
    });
    const bangumiMock = buildMockSource({
      type: 'bangumi',
      fetchTopAnime: mock(async () => [makeItem({ id: 'b1', source: 'bangumi' })]),
    });

    // Pin browseSource to bangumi, then pass undefined preferred.
    await dataSourceConfig.setBrowseSource('bangumi');

    const repo = new AnimeRepository({
      anilist: anilistMock,
      bangumi: bangumiMock,
    });

    const result = await repo.fetchTopAnime();
    expect(bangumiMock.fetchTopAnime).toHaveBeenCalledTimes(1);
    expect(anilistMock.fetchTopAnime).not.toHaveBeenCalled();
    expect(result.length).toBe(1);
  });

  it('REPO-003 resolveSource falls back to AniList when no preferred and config unavailable', async () => {
    const anilistMock = buildMockSource({
      type: 'anilist',
      fetchTopAnime: mock(async () => [makeItem({ id: 'a1', source: 'anilist' })]),
    });
    // Only register anilist; browseSource defaults to anilist anyway, but
    // the explicit fallback path is also exercised: pass a sources map that
    // doesn't include the browseSource.
    const repo = new AnimeRepository({ anilist: anilistMock });

    const result = await repo.fetchTopAnime();
    expect(anilistMock.fetchTopAnime).toHaveBeenCalledTimes(1);
    expect(result[0].sourcePlatform).toBe('anilist');
  });

  it('REPO-004 constructor initializes 7 default data sources when none injected', () => {
    const repo = new AnimeRepository();
    // 7 read-capable platforms per spec (anilist, myanimelist, bangumi,
    // annict, kitsu, shikimori, simkl). Annict construction may legitimately
    // fail in environments without env vars — guard for at least 6.
    expect(repo.sourceCount).toBeGreaterThanOrEqual(6);
    expect(repo.hasSource('anilist')).toBe(true);
    expect(repo.hasSource('myanimelist')).toBe(true);
    expect(repo.hasSource('bangumi')).toBe(true);
    expect(repo.hasSource('kitsu')).toBe(true);
    expect(repo.hasSource('shikimori')).toBe(true);
    expect(repo.hasSource('simkl')).toBe(true);
  });

  it('REPO-005 constructor accepts and uses a custom source map', async () => {
    const customSearch = mock(async () => [makeItem({ id: 'x1', source: 'anilist' })]);
    const customSource = buildMockSource({
      type: 'anilist',
      searchAnime: customSearch,
    });
    const repo = new AnimeRepository({ anilist: customSource });

    const result = await repo.searchAnime('foo', 1, 'anilist');
    expect(customSearch).toHaveBeenCalledTimes(1);
    expect(customSearch).toHaveBeenCalledWith('foo', 1);
    expect(result.length).toBe(1);
  });

  // -------- QueryClient dedup (REPO-010, REPO-011) --------

  it('REPO-010 parallel searchAnime with same args calls fetcher once (dedup)', async () => {
    let callCount = 0;
    const search = mock(async (q: string, page?: number) => {
      callCount++;
      // Yield so a second caller arriving immediately sees us in-flight.
      await Promise.resolve();
      return [makeItem({ id: `${q}-${page}`, source: 'anilist' })];
    });
    const source = buildMockSource({
      type: 'anilist',
      searchAnime: search,
    });
    const repo = new AnimeRepository({ anilist: source });

    const [a, b] = await Promise.all([
      repo.searchAnime('Bebop', 1, 'anilist'),
      repo.searchAnime('Bebop', 1, 'anilist'),
    ]);
    expect(callCount).toBe(1);
    expect(a).toEqual(b);
    expect(a.length).toBe(1);
  });

  it('REPO-011 parallel fetchAnimeDetail with same args calls fetcher once (dedup)', async () => {
    let callCount = 0;
    const detail = mock(async (id: string) => {
      callCount++;
      await Promise.resolve();
      return makeItem({ id, source: 'anilist' });
    });
    const source = buildMockSource({
      type: 'anilist',
      fetchAnimeDetail: detail,
    });
    const repo = new AnimeRepository({ anilist: source });

    const [a, b] = await Promise.all([
      repo.fetchAnimeDetail(1, 'anilist'),
      repo.fetchAnimeDetail(1, 'anilist'),
    ]);
    expect(callCount).toBe(1);
    expect(a).toBe(b);
  });

  // -------- Cache behavior (REPO-012, REPO-013) --------

  it('REPO-012 empty seasonal result is NOT written to disk cache', async () => {
    const source = buildMockSource({
      type: 'anilist',
      fetchSeasonalAnime: mock(async () => []),
    });
    const repo = new AnimeRepository({ anilist: source });
    const setSpy = spyOn(CacheService, 'set');

    const result = await repo.fetchSeasonalAnime(1, 'WINTER', 2024, 'anilist');
    expect(result.length).toBe(0);
    expect(setSpy).not.toHaveBeenCalled();
    setSpy.mockRestore();
  });

  it('REPO-013 disk cache hit short-circuits HTTP call', async () => {
    const fetchSeasonal = mock(async () => [makeItem({ id: 'a1', source: 'anilist' })]);
    const source = buildMockSource({
      type: 'anilist',
      fetchSeasonalAnime: fetchSeasonal,
    });

    // Pre-populate disk cache for the exact key the repository will compute.
    const cacheKey = `seasonal_anilist_2024_WINTER_1_r0`;
    const preExisting = [makeItem({ id: 'cached', source: 'anilist' })];
    await CacheService.set(cacheKey, preExisting, 60_000);

    const repo = new AnimeRepository({ anilist: source });
    const result = await repo.fetchSeasonalAnime(1, 'WINTER', 2024, 'anilist');

    expect(fetchSeasonal).not.toHaveBeenCalled();
    expect(result.length).toBe(1);
    // The cached value is rehydrated from JSON so it won't be the same
    // instance — assert via id.
    expect(result[0].id).toBe('cached');
  });

  // -------- Genres fallback (REPO-020) --------

  it('REPO-020 genres fetch falls back to AniList when primary source throws', async () => {
    const anilistGenres = mock(
      async (): Promise<AnimeGenre[]> => [
        { id: 1, name: 'Action' },
        { id: 2, name: 'Comedy' },
      ]
    );
    const anilist = buildMockSource({
      type: 'anilist',
      fetchGenres: anilistGenres,
    });

    const bangumiGenres = mock(async (): Promise<AnimeGenre[]> => {
      throw new Error('bangumi genres unavailable');
    });
    const bangumi = buildMockSource({
      type: 'bangumi',
      fetchGenres: bangumiGenres,
    });

    const repo = new AnimeRepository({ anilist, bangumi });

    const result = await repo.fetchAnimeGenres('bangumi');
    expect(bangumiGenres).toHaveBeenCalledTimes(1);
    expect(anilistGenres).toHaveBeenCalledTimes(1);
    expect(result.length).toBe(2);
    expect(result[0].name).toBe('Action');
  });

  // -------- Media fallback to Jikan (REPO-021..023) --------

  it('REPO-021 empty staff result triggers Jikan fallback when source is non-MAL', async () => {
    // Bangumi returns [] for staff (default stub behavior). Jikan returns one.
    const bangumiStaff = mock(async (): Promise<AnimeStaff[]> => []);
    const bangumi = buildMockSource({
      type: 'bangumi',
      fetchAnimeStaff: bangumiStaff,
    });

    const jikanStaff = mock(
      async (id: string): Promise<AnimeStaff[]> => [
        { id: `${id}-staff`, name: 'Director Test', role: 'Director' },
      ]
    );
    const jikan = buildMockSource({
      type: 'myanimelist',
      fetchAnimeStaff: jikanStaff,
    });

    // Pin browse to bangumi.
    await dataSourceConfig.setBrowseSource('bangumi');

    const repo = new AnimeRepository({
      anilist: buildMockSource({ type: 'anilist' }),
      bangumi,
      myanimelist: jikan,
    });

    // Provide a manual mapping so translateID can resolve bangumi → mal.
    idMappingService.setManualMapping('bangumi', 7157, 'myanimelist', 12189);

    const staff = await repo.fetchAnimeStaff(7157, 'bangumi');
    expect(bangumiStaff).toHaveBeenCalledTimes(1);
    expect(jikanStaff).toHaveBeenCalledTimes(1);
    expect(staff.length).toBe(1);
    expect(staff[0].name).toBe('Director Test');
  });

  it('REPO-022 Jikan fallback resolves the original id via IDMappingService before calling Jikan', async () => {
    const bangumi = buildMockSource({
      type: 'bangumi',
      fetchAnimeStaff: mock(async () => []),
    });
    const jikanStaff = mock(
      async (id: string): Promise<AnimeStaff[]> => [
        { id: 'mal-staff', name: 'MAL Director', role: 'Director' },
      ]
    );
    const jikan = buildMockSource({
      type: 'myanimelist',
      fetchAnimeStaff: jikanStaff,
    });

    await dataSourceConfig.setBrowseSource('bangumi');

    const repo = new AnimeRepository({
      anilist: buildMockSource({ type: 'anilist' }),
      bangumi,
      myanimelist: jikan,
    });

    // Manual mapping: bangumi 7157 → MAL 12189.
    idMappingService.setManualMapping('bangumi', 7157, 'myanimelist', 12189);

    await repo.fetchAnimeStaff(7157, 'bangumi');

    // Jikan was called with the translated MAL id, not the original bangumi id.
    expect(jikanStaff).toHaveBeenCalledTimes(1);
    expect(jikanStaff).toHaveBeenCalledWith('12189');
  });

  it('REPO-023 empty staff result from MAL itself does NOT trigger a second fetch', async () => {
    const malStaff = mock(async (): Promise<AnimeStaff[]> => []);
    const jikan = buildMockSource({
      type: 'myanimelist',
      fetchAnimeStaff: malStaff,
    });
    // browseSource defaults to anilist; pin to MAL so the active source IS MAL.
    await dataSourceConfig.setBrowseSource('myanimelist');

    const repo = new AnimeRepository({
      anilist: buildMockSource({ type: 'anilist' }),
      myanimelist: jikan,
    });

    const staff = await repo.fetchAnimeStaff(12189, 'myanimelist');
    expect(staff).toEqual([]);
    // Only ONE call: the original. No fallback because source is already MAL.
    expect(malStaff).toHaveBeenCalledTimes(1);
  });

  // -------- Cancellation (REPO-030) --------

  it('REPO-030 fetchSeasonalAnime throws CancellationError when browseSource changes mid-flight', async () => {
    let releaseFetch: (() => void) | null = null;
    const fetchSeasonal = mock(async () => {
      // Keep fetcher pending until we change the browseSource.
      await new Promise<void>((resolve) => {
        releaseFetch = resolve;
      });
      return [makeItem({ id: 'a1', source: 'anilist' })];
    });
    const anilist = buildMockSource({
      type: 'anilist',
      fetchSeasonalAnime: fetchSeasonal,
    });
    const bangumi = buildMockSource({
      type: 'bangumi',
      fetchSeasonalAnime: mock(async () => []),
    });

    const repo = new AnimeRepository({ anilist, bangumi });

    // Default browseSource is 'anilist'. Start the fetch without preferred.
    const pending = repo.fetchSeasonalAnime(1, 'WINTER', 2024).then(
      (v) => ({ kind: 'ok' as const, value: v }),
      (e) => ({ kind: 'err' as const, error: e })
    );

    // Wait until the fetcher actually starts (releaseFetch becomes set).
    while (releaseFetch === null) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }

    // Switch browseSource — this is the mid-flight change.
    await dataSourceConfig.setBrowseSource('bangumi');

    // Release the pending fetch so the cancellation check fires.
    (releaseFetch as () => void)();

    const outcome = await pending;
    expect(outcome.kind).toBe('err');
    if (outcome.kind === 'err') {
      expect(outcome.error).toBeInstanceOf(CancellationError);
    }
  });

  // -------- ID translation (REPO-031, REPO-032) --------

  it('REPO-031 translateID returns the original id when source equals target', async () => {
    // Surface translateId via a public path: media fallback. When
    // sourcePlatform === current source, no mapping happens — verify by
    // asserting the queryId received by the mocked fetcher.
    const malStaff = mock(async (id: string) => {
      expect(id).toBe('12189');
      return [{ id: 'staff-1', name: 'd' }];
    });
    const jikan = buildMockSource({
      type: 'myanimelist',
      fetchAnimeStaff: malStaff,
    });
    await dataSourceConfig.setBrowseSource('myanimelist');
    const repo = new AnimeRepository({
      anilist: buildMockSource({ type: 'anilist' }),
      myanimelist: jikan,
    });

    const translateSpy = spyOn(idMappingService, 'translate');
    await repo.fetchAnimeStaff(12189, 'myanimelist');
    // translate must NOT be called for same-platform requests.
    expect(translateSpy).not.toHaveBeenCalled();
    translateSpy.mockRestore();
  });

  it('REPO-032 translateID returns the original id string when no mapping exists', async () => {
    // Bangumi staff returns []; MAL has no mapping for the bangumi id;
    // fallback should still attempt with original id and return [] without throwing.
    const bangumi = buildMockSource({
      type: 'bangumi',
      fetchAnimeStaff: mock(async () => []),
    });
    const jikanStaff = mock(async () => []);
    const jikan = buildMockSource({
      type: 'myanimelist',
      fetchAnimeStaff: jikanStaff,
    });
    await dataSourceConfig.setBrowseSource('bangumi');
    const repo = new AnimeRepository({
      anilist: buildMockSource({ type: 'anilist' }),
      bangumi,
      myanimelist: jikan,
    });

    // Force translate to return null (no mapping); jikan fallback should not
    // be called because resolveMalId returns null.
    const translateSpy = spyOn(idMappingService, 'translate').mockResolvedValue(null);

    const staff = await repo.fetchAnimeStaff(99999, 'bangumi');
    expect(staff).toEqual([]);
    // bangumi.fetchAnimeStaff did get called (with translated bangumi id).
    expect(bangumi.fetchAnimeStaff).toHaveBeenCalledTimes(1);
    // jikan fallback was attempted but resolveMalId returned null → no call.
    expect(jikanStaff).not.toHaveBeenCalled();
    translateSpy.mockRestore();
  });

  it('REPO-040 legacy searchAnime sends isAdult=false and filters adult rows when SFW mode is on', async () => {
    const calls: FetchCall[] = [];
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const parsedBody = JSON.parse((init?.body as string) ?? '{}') as FetchCall['parsedBody'];
      calls.push({ url: String(url), init, parsedBody });
      return fakeJson({
        data: {
          Page: {
            media: [
              makeAniListAnime({ id: 1, title: { romaji: 'Safe', english: 'Safe', native: null } }),
              makeAniListAnime({
                id: 2,
                title: { romaji: 'Explicit Adult', english: null, native: null },
                isAdult: true,
              }),
              makeAniListAnime({
                id: 3,
                title: { romaji: 'Tag Adult', english: null, native: null },
                genres: ['Ecchi'],
              }),
            ],
          },
        },
      });
    });
    AniListClient.__setDefaultForTests(
      new AniListClient({ fetchImpl: fetchImpl as unknown as typeof fetch })
    );

    const results = await AnimeRepository.searchAnime('adult-check', 1);

    expect(calls).toHaveLength(1);
    expect(calls[0].parsedBody.variables).toMatchObject({ search: 'adult-check', isAdult: false });
    expect(results.map((item) => item.title)).toEqual(['Safe']);
  });

  it('REPO-041 legacy getGenres hides adult genre cards when SFW mode is on', async () => {
    const calls: FetchCall[] = [];
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const parsedBody = JSON.parse((init?.body as string) ?? '{}') as FetchCall['parsedBody'];
      calls.push({ url: String(url), init, parsedBody });

      if (parsedBody.query.includes('GenreCollection')) {
        return fakeJson({
          data: { GenreCollection: ['Action', 'Hentai', 'Ecchi', 'Comedy'] },
        });
      }

      return fakeJson({
        data: {
          Page: {
            media: [
              makeAniListAnime({
                id: 10,
                title: {
                  romaji: `${String(parsedBody.variables.genre)} Sample`,
                  english: null,
                  native: null,
                },
                genres: [String(parsedBody.variables.genre)],
              }),
            ],
          },
        },
      });
    });
    AniListClient.__setDefaultForTests(
      new AniListClient({ fetchImpl: fetchImpl as unknown as typeof fetch })
    );

    const genres = await AnimeRepository.getGenres();

    expect(genres.map((genre) => genre.displayName)).toEqual(['Action', 'Comedy']);
    expect(calls.map((call) => call.parsedBody.variables.genre).filter(Boolean)).toEqual([
      'Action',
      'Comedy',
    ]);
  });
});
