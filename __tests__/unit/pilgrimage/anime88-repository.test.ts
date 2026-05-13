// Unit tests for the Anime Tourism 88 offline repository.
// Spec cases: A88-REPO-001..007.

import { describe, expect, it, mock } from 'bun:test';

import type { AnimeTourism88Entry } from '../../../libs/services/pilgrimage/anime88-repository';

const YURUCAMP_YAMANASHI: AnimeTourism88Entry = {
  id: 1,
  year: 2025,
  titleJa: '『ゆるキャン△』シリーズ',
  titleEn: 'LAID-BACK CAMP series',
  region: 'chubu',
  prefecture: '山梨県',
  city: '山梨市',
  regionEn: 'Yamanashi Pref. / Yamanashi City',
  externalIds: { bangumi: 207195, anilist: 98444, mal: null },
  anilistPopularity: 160391,
};
const YURUCAMP_TOKYO: AnimeTourism88Entry = {
  id: 2,
  year: 2025,
  titleJa: '『ゆるキャン△』シリーズ',
  titleEn: 'LAID-BACK CAMP series',
  region: 'tokyo',
  prefecture: '東京都',
  city: '昭島市',
  regionEn: 'Tokyo / Akishima City',
  externalIds: { bangumi: 207195, anilist: 98444, mal: null },
  anilistPopularity: 160391,
};
const BOCCHI: AnimeTourism88Entry = {
  id: 3,
  year: 2025,
  titleJa: 'ぼっち・ざ・ろっく！',
  titleEn: 'BOCCHI THE ROCK!',
  region: 'tokyo',
  prefecture: '東京都',
  city: '世田谷区',
  regionEn: 'Tokyo / Setagaya-ku',
  externalIds: { bangumi: 328609, anilist: 130003, mal: null },
  anilistPopularity: 244113,
};
const ANOHANA: AnimeTourism88Entry = {
  id: 4,
  year: 2025,
  titleJa: 'あの日見た花の名前を僕達はまだ知らない。',
  titleEn: 'Anohana:The Flower We Saw That Day',
  region: 'kanto',
  prefecture: '埼玉県',
  city: '秩父市',
  regionEn: 'Saitama Pref. / Chichibu City',
  externalIds: { bangumi: 10440, anilist: 9989, mal: null },
  anilistPopularity: 379852,
};
const NULL_BANGUMI: AnimeTourism88Entry = {
  id: 5,
  year: 2025,
  titleJa: 'Mystery Show',
  titleEn: 'Mystery Show',
  region: 'kinki',
  prefecture: '京都府',
  city: '京都市',
  regionEn: 'Kyoto / Kyoto City',
  externalIds: { bangumi: null, anilist: null, mal: null },
  anilistPopularity: null,
};

mock.module('../../../libs/services/pilgrimage/anime-tourism-88.data.json', () => ({
  default: {
    generatedAt: '2026-05-13',
    source: 'fixture',
    year: 2025,
    count: 5,
    entries: [YURUCAMP_YAMANASHI, YURUCAMP_TOKYO, BOCCHI, ANOHANA, NULL_BANGUMI],
  },
}));

mock.module('../../../libs/services/pilgrimage/jp-city-centroids.data.json', () => ({
  default: {
    generatedAt: '2026-05-13',
    source: 'fixture',
    count: 4,
    entries: [
      { prefecture: '山梨県', city: '山梨市', lat: 35.6926, lng: 138.6845, queryUsed: '', source: 'nominatim' },
      { prefecture: '東京都', city: '昭島市', lat: 35.7058, lng: 139.3536, queryUsed: '', source: 'nominatim' },
      { prefecture: '東京都', city: '世田谷区', lat: 35.6469, lng: 139.6525, queryUsed: '', source: 'nominatim' },
      { prefecture: '埼玉県', city: '秩父市', lat: 36.0078, lng: 139.0843, queryUsed: '', source: 'nominatim' },
    ],
    failures: [],
  },
}));

const repo = await import('../../../libs/services/pilgrimage/anime88-repository');

describe('anime88-repository', () => {
  it('A88-REPO-001 getAll88Entries returns the canonical list in order', () => {
    const all = repo.getAll88Entries();
    expect(all.map((e) => e.id)).toEqual([1, 2, 3, 4, 5]);
    expect(repo.get88EntryCount()).toBe(5);
    expect(repo.get88EditionYear()).toBe(2025);
  });

  it('A88-REPO-002 get88EntriesByBangumiId returns every row for an anime', () => {
    const yurucamp = repo.get88EntriesByBangumiId(207195);
    expect(yurucamp.map((e) => e.city)).toEqual(['山梨市', '昭島市']);
    const bocchi = repo.get88EntriesByBangumiId(328609);
    expect(bocchi.map((e) => e.city)).toEqual(['世田谷区']);
    expect(repo.get88EntriesByBangumiId(99999999)).toEqual([]);
  });

  it('A88-REPO-003 get88EntriesByRegion filters by the 7-group taxonomy', () => {
    expect(repo.get88EntriesByRegion('tokyo').map((e) => e.id)).toEqual([2, 3]);
    expect(repo.get88EntriesByRegion('chubu').map((e) => e.id)).toEqual([1]);
    expect(repo.get88EntriesByRegion('kanto').map((e) => e.id)).toEqual([4]);
    expect(repo.get88EntriesByRegion('hokkaido_tohoku')).toEqual([]);
  });

  it('A88-REPO-004 is88 reflects current selection membership', () => {
    expect(repo.is88(207195)).toBe(true);
    expect(repo.is88(328609)).toBe(true);
    expect(repo.is88(999)).toBe(false);
  });

  it('A88-REPO-005 is88/getByBangumiId reject null and non-finite inputs', () => {
    expect(repo.is88(null)).toBe(false);
    expect(repo.is88(undefined)).toBe(false);
    expect(repo.is88(Number.NaN)).toBe(false);
    expect(repo.get88EntriesByBangumiId(null)).toEqual([]);
    expect(repo.get88EntriesByBangumiId(Number.NaN)).toEqual([]);
  });

  it('A88-REPO-006 getUnique88Anime dedups, aggregates regions, skips null bangumi', () => {
    const unique = repo.getUnique88Anime();
    expect(unique.map((u) => u.bangumiId)).toEqual([207195, 328609, 10440]);
    const yuru = unique.find((u) => u.bangumiId === 207195);
    expect(yuru?.locations).toHaveLength(2);
    expect(yuru?.regions.sort()).toEqual(['chubu', 'tokyo']);
    expect(yuru?.anilistPopularity).toBe(160391);
    expect(unique.find((u) => u.titleJa === 'Mystery Show')).toBeUndefined();
  });

  it('A88-REPO-006b getUnique88AnimeByPopularity sorts by anilist popularity desc', () => {
    const sorted = repo.getUnique88AnimeByPopularity();
    expect(sorted.map((u) => u.bangumiId)).toEqual([10440, 328609, 207195]);
    expect(sorted.map((u) => u.anilistPopularity)).toEqual([379852, 244113, 160391]);
  });

  it('A88-REPO-007 get88EntriesWithCoords joins entries to city centroids', () => {
    const withCoords = repo.get88EntriesWithCoords();
    // Mystery Show (id=5, 京都市) has no centroid in the fixture — should drop.
    expect(withCoords.map((e) => e.id)).toEqual([1, 2, 3, 4]);
    const tokyo = withCoords.find((e) => e.id === 2);
    expect(tokyo?.lat).toBeCloseTo(35.7058, 3);
    expect(tokyo?.lng).toBeCloseTo(139.3536, 3);
  });

  it('A88-REPO-008 ANIME_TOURISM_88_REGIONS lists all 7 groups', () => {
    expect(repo.ANIME_TOURISM_88_REGIONS).toEqual([
      'hokkaido_tohoku',
      'kanto',
      'tokyo',
      'chubu',
      'kinki',
      'chugoku_shikoku',
      'kyushu_okinawa',
    ]);
  });
});
