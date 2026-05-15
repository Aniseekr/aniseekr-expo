// Unit tests for the offline Anitabi index queries.
// Spec cases: PILG-IDX-001..006.

import { describe, expect, it, mock } from 'bun:test';

import type { AnitabiIndexEntry } from '../../../libs/services/pilgrimage/anitabi-index';

// Fixture index installed before importing the module under test so the
// module's static `import indexJson from './anitabi-index.data.json'` resolves
// to deterministic data instead of the shipped, regeneration-volatile file.
const TOKYO: AnitabiIndexEntry = {
  id: 1,
  title: 'Tokyo Anime',
  cn: '东京番',
  city: '东京都',
  cover: '',
  color: '#fff',
  lat: 35.6895,
  lng: 139.6917,
  zoom: 12,
  pointsLength: 100,
  builtAt: 0,
};
const KYOTO: AnitabiIndexEntry = {
  id: 2,
  title: 'Kyoto Anime',
  cn: '京都番',
  city: '京都市',
  cover: '',
  color: '#aaa',
  lat: 35.0116,
  lng: 135.7681,
  zoom: 12,
  pointsLength: 80,
  builtAt: 0,
};
const FUKUOKA: AnitabiIndexEntry = {
  id: 3,
  title: 'Fukuoka Anime',
  cn: '福冈番',
  city: '福冈市',
  cover: '',
  color: '#bbb',
  lat: 33.5904,
  lng: 130.4017,
  zoom: 11,
  pointsLength: 50,
  builtAt: 0,
};
const FIJI: AnitabiIndexEntry = {
  id: 4,
  title: 'Fiji Anime',
  cn: '斐济番',
  city: '苏瓦',
  cover: '',
  color: '#ccc',
  lat: -18.1248,
  lng: 178.4501, // just west of antimeridian
  zoom: 8,
  pointsLength: 12,
  builtAt: 0,
};
const SAMOA: AnitabiIndexEntry = {
  id: 5,
  title: 'Samoa Anime',
  cn: '萨摩亚番',
  city: '阿皮亚',
  cover: '',
  color: '#ddd',
  lat: -13.85,
  lng: -171.75, // just east of antimeridian
  zoom: 8,
  pointsLength: 9,
  builtAt: 0,
};

mock.module('../../../libs/services/pilgrimage/anitabi-index.data.json', () => ({
  default: {
    generatedAt: 1700000000000,
    source: 'fixture',
    entries: [TOKYO, KYOTO, FUKUOKA, FIJI, SAMOA],
  },
}));

const indexModule = await import('../../../libs/services/pilgrimage/anitabi-index');
const nearbyMapModule = await import('../../../libs/services/pilgrimage/map-nearby');

describe('anitabi-index', () => {
  it('PILG-IDX-001 returns all entries via getAllIndexed', () => {
    const all = indexModule.getAllIndexed();
    expect(all.map((e) => e.id).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('PILG-IDX-002 filters by bounding box (Kansai window)', () => {
    // ~Kansai region: includes Kyoto, excludes Tokyo and Fukuoka.
    const inBox = indexModule.getAnimeInBounds({
      north: 35.5,
      south: 34.5,
      east: 136.5,
      west: 135.0,
    });
    expect(inBox.map((e) => e.id)).toEqual([2]);
  });

  it('PILG-IDX-003 honours the exclude option', () => {
    const all = indexModule.getAnimeInBounds(
      { north: 36, south: 33, east: 140, west: 130 },
      { exclude: [1, 3] }
    );
    expect(all.map((e) => e.id)).toEqual([2]);
  });

  it('PILG-IDX-004 caps results with limit', () => {
    const got = indexModule.getAnimeInBounds(
      { north: 50, south: -50, east: 180, west: -180 },
      { limit: 2 }
    );
    expect(got).toHaveLength(2);
  });

  it('PILG-IDX-005 handles antimeridian-crossing bounds', () => {
    // east=-170, west=170 → narrow strip covering the dateline.
    const got = indexModule.getAnimeInBounds({
      north: 0,
      south: -30,
      east: -170,
      west: 170,
    });
    expect(got.map((e) => e.id).sort()).toEqual([4, 5]);
  });

  it('PILG-IDX-006 returns nearby entries sorted by distance', () => {
    // From Tokyo: nearest is Tokyo itself (0 km), then Kyoto (~364 km), then Fukuoka.
    const got = indexModule.getAnimeNear({
      lat: 35.6895,
      lng: 139.6917,
      radiusKm: 1000,
    });
    expect(got.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(got[0].distanceKm).toBeLessThan(0.1);
    expect(got[1].distanceKm).toBeGreaterThan(350);
    expect(got[1].distanceKm).toBeLessThan(380);
  });

  it('PILG-IDX-007 radius filter excludes far entries', () => {
    const got = indexModule.getAnimeNear({
      lat: 35.6895,
      lng: 139.6917,
      radiusKm: 100,
    });
    expect(got.map((e) => e.id)).toEqual([1]);
  });

  it('PILG-MAP-LOC-001 picks map recenter candidates within 30km and excludes loaded ids', () => {
    expect(nearbyMapModule.MAP_LOCATE_RADIUS_KM).toBe(30);
    expect(nearbyMapModule.MAP_LOCATE_ZOOM).toBe(12);

    const got = nearbyMapModule.getNearbyMapEntries(
      { latitude: 35.6895, longitude: 139.6917 },
      { exclude: [1] }
    );
    expect(got).toEqual([]);

    const withoutExclude = nearbyMapModule.getNearbyMapEntries({
      latitude: 35.6895,
      longitude: 139.6917,
    });
    expect(withoutExclude.map((e) => e.id)).toEqual([1]);
    expect(withoutExclude[0].distanceKm).toBeLessThan(0.1);
  });

  it('PILG-IDX-008 ignores non-finite inputs', () => {
    expect(
      indexModule.getAnimeInBounds({
        north: Number.NaN,
        south: 0,
        east: 0,
        west: 0,
      })
    ).toEqual([]);
    expect(
      indexModule.getAnimeNear({ lat: Number.NaN, lng: 0, radiusKm: 100 })
    ).toEqual([]);
    expect(
      indexModule.getAnimeNear({ lat: 0, lng: 0, radiusKm: 0 })
    ).toEqual([]);
  });

  it('PILG-IDX-009 rejects bounds with inverted lat', () => {
    expect(
      indexModule.getAnimeInBounds({ north: 0, south: 10, east: 180, west: -180 })
    ).toEqual([]);
  });

  it('PILG-IDX-010 notifies subscribers and normalizes covers after runtime hydration', () => {
    let notifications = 0;
    const before = indexModule.getIndexVersion();
    const unsubscribe = indexModule.subscribeAnitabiIndex(() => {
      notifications += 1;
    });

    indexModule.hydrateFromRuntime({
      generatedAt: 1700000001000,
      source: 'runtime-fixture',
      entries: [
        {
          ...TOKYO,
          cover: '/images/bangumi/1.jpg',
        },
      ],
    });

    expect(indexModule.getIndexVersion()).toBe(before + 1);
    expect(notifications).toBe(1);
    expect(indexModule.getAllIndexed()[0].cover).toBe(
      'https://image.anitabi.cn/bangumi/1.jpg?plan=h160'
    );

    unsubscribe();
  });
});
