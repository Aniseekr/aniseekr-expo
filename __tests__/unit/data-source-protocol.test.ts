import { describe, it, expect } from 'bun:test';
import {
  defaultMediaStubs,
  defaultStatsStub,
  type AnimeDataSource,
  type AnimeGenre,
} from '../../libs/services/data-sources/anime-data-source';
import type { PlatformType } from '../../libs/services/auth/types';
import { UnifiedAnimeItem } from '../../libs/models/unified-anime-item';

/**
 * Minimal in-memory data source used to verify the protocol contract. We
 * mix in `defaultMediaStubs()` and `defaultStatsStub()` so the assertions
 * exercise the published default implementations.
 */
function makeFakeSource(type: PlatformType): AnimeDataSource {
  return {
    type,
    async searchAnime(_q: string, _page?: number) {
      return [];
    },
    async fetchAnime(_page: number, _genreId?: number) {
      return [];
    },
    async fetchGenres(): Promise<AnimeGenre[]> {
      return [];
    },
    async fetchTopAnime(_page?: number) {
      return [];
    },
    async fetchSeasonalAnime(_page?: number, _season?: string, _year?: number) {
      return [];
    },
    async fetchAnimeDetail(id: string) {
      return new UnifiedAnimeItem({
        title: 'Stub',
        platformData: { [type]: { id } } as Record<PlatformType, { id: string }>,
      });
    },
    ...defaultMediaStubs(),
    ...defaultStatsStub(),
  };
}

describe('AnimeDataSource protocol defaults', () => {
  it('ADS-001 every data source exposes type matching its PlatformType', () => {
    const source = makeFakeSource('anilist');
    expect(source.type).toBe('anilist');
    const source2 = makeFakeSource('bangumi');
    expect(source2.type).toBe('bangumi');
  });

  it('ADS-002 default fetchAnimeStaff returns empty array (not error)', async () => {
    const source = makeFakeSource('anilist');
    const result = await source.fetchAnimeStaff('1');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('ADS-003 default fetchAnimeThemes returns null', async () => {
    const source = makeFakeSource('anilist');
    const result = await source.fetchAnimeThemes('1');
    expect(result).toBeNull();
  });

  it('ADS-004 default fetchStatistics returns null', async () => {
    const source = makeFakeSource('anilist');
    const result = await source.fetchStatistics('1');
    expect(result).toBeNull();
  });
});
