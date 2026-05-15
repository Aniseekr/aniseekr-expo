import { describe, expect, it, mock } from 'bun:test';

import type { AnitabiIndexEntry } from '../../../libs/services/pilgrimage/anitabi-index';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';
import { PilgrimageSearchService } from '../../../libs/services/pilgrimage/pilgrimage-search-service';

const MONO: AnitabiIndexEntry = {
  id: 485936,
  title: 'mono',
  cn: 'mono女孩',
  city: '山梨县',
  cover: '/images/bangumi/485936.jpg',
  color: '#fd6300',
  lat: 35.66903,
  lng: 138.580741,
  zoom: 18,
  pointsLength: 1,
  episodes: null,
  startYear: 2025,
  builtAt: 0,
};

const HYOUKA: AnitabiIndexEntry = {
  id: 27364,
  title: '氷菓',
  cn: '冰菓',
  city: '高山市',
  cover: 'https://image.anitabi.cn/bangumi/27364.jpg?plan=h160',
  color: '#8DC5D8',
  lat: 36.141,
  lng: 137.252,
  zoom: 12,
  pointsLength: 58,
  episodes: 22,
  startYear: 2012,
  builtAt: 0,
};

function fallbackBangumi(): AnitabiBangumi {
  return {
    id: 888,
    cn: '巡礼番',
    title: 'Fallback Anime',
    city: '東京都',
    cover: 'https://image.anitabi.cn/bangumi/888.jpg?plan=h160',
    color: '#ff9f0a',
    geo: [35.68, 139.76],
    zoom: 12,
    modified: 1,
    litePoints: [],
    pointsLength: 12,
    imagesLength: 12,
  };
}

describe('PilgrimageSearchService', () => {
  it('returns Anitabi index matches with Bangumi ids', async () => {
    const service = new PilgrimageSearchService({ getIndexed: () => [MONO, HYOUKA] });
    const results = await service.search('mono');

    expect(results[0]).toMatchObject({
      bangumiId: 485936,
      title: 'mono',
      titleCn: 'mono女孩',
      city: '山梨县',
      source: 'anitabi-index',
    });
    expect(results[0].cover).toBe('https://image.anitabi.cn/bangumi/485936.jpg?plan=h160');
  });

  it('matches Chinese titles from the local Anitabi index', async () => {
    const service = new PilgrimageSearchService({ getIndexed: () => [MONO, HYOUKA] });
    const results = await service.search('冰菓');

    expect(results.map((r) => r.bangumiId)).toEqual([27364]);
    expect(results[0].pointsLength).toBe(58);
  });

  it('matches English cross-index titles without changing the Bangumi identity', async () => {
    const service = new PilgrimageSearchService({
      getIndexed: () => [MONO, HYOUKA],
      lookupCrossIndex: (bangumiId) =>
        bangumiId === 485936
          ? {
              bangumiId: 485936,
              anilistId: 176246,
              malId: 58492,
              anilistPopularity: 12715,
              anilistEpisodes: null,
              anilistStartYear: 2025,
              titleJa: 'mono',
              titleCn: 'mono女孩',
              titleRomaji: 'mono',
              titleEnglish: 'Mono',
              matchType: 'exact_native',
              matchNote: null,
              resolvedAt: 0,
            }
          : null,
    });

    const results = await service.search('Mono', { includeBangumiFallback: false });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      bangumiId: 485936,
      titleEnglish: 'Mono',
      titleRomaji: 'mono',
      titleCn: 'mono女孩',
    });
  });

  it('falls back to Bangumi search and verifies Anitabi data before returning a result', async () => {
    const bangumiClient = {
      searchSubjects: mock(async () => ({
        data: [
          { id: 777, name: 'No Spots', name_cn: '沒有巡禮' },
          { id: 888, name: 'Fallback Anime', name_cn: '巡礼番' },
        ],
      })),
    };
    const repository = {
      getSpotsByBangumiId: mock(async (id: number) => (id === 888 ? fallbackBangumi() : null)),
    };
    const service = new PilgrimageSearchService({
      bangumiClient,
      repository,
      getIndexed: () => [],
    });

    const results = await service.search('fallback');

    expect(bangumiClient.searchSubjects).toHaveBeenCalledWith('fallback', 1);
    expect(repository.getSpotsByBangumiId).toHaveBeenCalledWith(777);
    expect(repository.getSpotsByBangumiId).toHaveBeenCalledWith(888);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      bangumiId: 888,
      title: 'Fallback Anime',
      titleCn: '巡礼番',
      source: 'bangumi-fallback',
    });
  });
});
