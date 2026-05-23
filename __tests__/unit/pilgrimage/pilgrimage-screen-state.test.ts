import { describe, expect, it } from 'bun:test';

import {
  appendIndexedEntries,
  appendIndexedEntriesExcludingKnownAnimes,
  buildKnownAnimeIdSet,
  buildSeededPilgrimageAnimes,
  seedPilgrimageAnimeFromIndex,
  sameLatLng,
  samePointIds,
} from '../../../libs/services/pilgrimage/pilgrimage-screen-state';
import { getAllIndexed } from '../../../libs/services/pilgrimage/anitabi-index';
import type { AnitabiIndexEntry } from '../../../libs/services/pilgrimage/anitabi-index';
import type { AnitabiBangumi, AnitabiPoint } from '../../../libs/services/pilgrimage/types';

function indexEntry(id: number): AnitabiIndexEntry {
  return {
    id,
    title: `Title ${id}`,
    cn: '',
    city: '',
    cover: '',
    color: '',
    lat: 35 + id / 100,
    lng: 139,
    zoom: 12,
    pointsLength: 1,
    builtAt: 1,
  };
}

function anime(id: number): AnitabiBangumi {
  return {
    id,
    title: `Anime ${id}`,
    cn: '',
    city: '',
    cover: '',
    color: '',
    geo: [35, 139],
    zoom: 12,
    modified: 1,
    litePoints: [],
    pointsLength: 1,
    imagesLength: 1,
  };
}

function point(id: string): AnitabiPoint {
  return {
    id,
    name: id,
    image: '',
    ep: 1,
    s: 0,
    geo: [35, 139],
  };
}

describe('pilgrimage screen state helpers', () => {
  it('keeps indexed map identity when bounds return only known entries', () => {
    const prev = new Map([[1, indexEntry(1)]]);

    expect(appendIndexedEntries(prev, [indexEntry(1)])).toBe(prev);
  });

  it('appends only new indexed entries and preserves previous entries', () => {
    const prevEntry = indexEntry(1);
    const nextEntry = indexEntry(2);
    const prev = new Map([[1, prevEntry]]);
    const next = appendIndexedEntries(prev, [prevEntry, nextEntry]);

    expect(next).not.toBe(prev);
    expect([...next.keys()]).toEqual([1, 2]);
    expect(next.get(1)).toBe(prevEntry);
    expect(next.get(2)).toBe(nextEntry);
  });

  it('builds the bounds exclusion set from loaded anime and indexed extras', () => {
    const known = buildKnownAnimeIdSet([anime(10)], new Map([[20, indexEntry(20)]]));

    expect([...known].sort((a, b) => a - b)).toEqual([10, 20]);
  });

  it('does not append indexed entries already present in loaded anime', () => {
    const prev = new Map([[20, indexEntry(20)]]);
    const next = appendIndexedEntriesExcludingKnownAnimes(
      prev,
      [indexEntry(10), indexEntry(20), indexEntry(30)],
      [anime(10)]
    );

    expect(next).not.toBe(prev);
    expect([...next.keys()]).toEqual([20, 30]);
  });

  it('converts indexed entries into immediately renderable anime seeds', () => {
    const seeded = seedPilgrimageAnimeFromIndex(indexEntry(42));

    expect(seeded).toMatchObject({
      id: 42,
      title: 'Title 42',
      cn: '',
      city: '',
      cover: '',
      color: '',
      geo: [35.42, 139],
      zoom: 12,
      modified: 1,
      litePoints: [],
      pointsLength: 1,
      imagesLength: 0,
    });
  });

  it('builds sorted seeds from the active offline index', () => {
    const activeEntries = getAllIndexed().slice(0, 3);
    const ids = activeEntries.map((entry) => entry.id).reverse();
    const seeded = buildSeededPilgrimageAnimes([...ids, -1]);

    expect(seeded).toHaveLength(activeEntries.length);
    expect(seeded.map((anime) => anime.id)).not.toContain(-1);
    for (const anime of seeded) {
      expect(anime.geo[0]).not.toBe(0);
      expect(anime.geo[1]).not.toBe(0);
      expect(anime.litePoints).toEqual([]);
    }
    const pointCounts = seeded.map((anime) => anime.pointsLength ?? 0);
    expect(pointCounts).toEqual([...pointCounts].sort((a, b) => b - a));
  });

  it('compares location fixes by coordinates', () => {
    expect(sameLatLng(null, null)).toBe(true);
    expect(sameLatLng({ latitude: 35, longitude: 139 }, { latitude: 35, longitude: 139 })).toBe(
      true
    );
    expect(
      sameLatLng({ latitude: 35, longitude: 139 }, { latitude: 35.0001, longitude: 139 })
    ).toBe(false);
  });

  it('compares point lists by stable ids', () => {
    expect(samePointIds([point('a'), point('b')], [point('a'), point('b')])).toBe(true);
    expect(samePointIds([point('a'), point('b')], [point('b'), point('a')])).toBe(false);
  });
});
