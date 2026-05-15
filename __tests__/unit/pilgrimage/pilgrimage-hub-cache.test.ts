import { beforeEach, describe, expect, it } from 'bun:test';

import {
  __resetPilgrimageHubCacheForTests,
  getPilgrimageHubSnapshot,
  updatePilgrimageHubSnapshot,
} from '../../../libs/services/pilgrimage/pilgrimage-hub-cache';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';
import type { VisitedMap } from '../../../libs/services/pilgrimage/visited-prefs';

const anime = (id: number): AnitabiBangumi => ({
  id,
  title: `Anime ${id}`,
  cn: '',
  city: 'Tokyo',
  cover: `https://image.anitabi.cn/bangumi/${id}.jpg?plan=h160`,
  color: '#00bcd4',
  geo: [35.68, 139.76],
  zoom: 12,
  modified: 0,
  litePoints: [],
  pointsLength: 1,
  imagesLength: 1,
});

describe('pilgrimage-hub-cache', () => {
  beforeEach(() => {
    __resetPilgrimageHubCacheForTests();
  });

  it('returns null before any snapshot is saved', () => {
    expect(getPilgrimageHubSnapshot()).toBeNull();
  });

  it('merges independently loaded slices', () => {
    updatePilgrimageHubSnapshot({ collectionAnimes: [anime(1)] });
    updatePilgrimageHubSnapshot({ featuredAnimes: [anime(2)] });

    const snapshot = getPilgrimageHubSnapshot();

    expect(snapshot?.collectionAnimes?.map((item) => item.id)).toEqual([1]);
    expect(snapshot?.featuredAnimes?.map((item) => item.id)).toEqual([2]);
  });

  it('copies mutable values when saving and reading', () => {
    const collection = [anime(1)];
    const visited: VisitedMap = { spotA: true };
    updatePilgrimageHubSnapshot({ collectionAnimes: collection, visited });
    collection.push(anime(2));
    visited.spotB = true;

    const snapshot = getPilgrimageHubSnapshot();
    snapshot?.collectionAnimes?.push(anime(3));
    if (snapshot?.visited) snapshot.visited.spotC = true;

    const next = getPilgrimageHubSnapshot();
    expect(next?.collectionAnimes?.map((item) => item.id)).toEqual([1]);
    expect(next?.visited).toEqual({ spotA: true });
  });

  it('keeps an explicit null location so denied location does not look uninitialized', () => {
    updatePilgrimageHubSnapshot({ userLocation: null });

    const snapshot = getPilgrimageHubSnapshot();

    expect(snapshot).not.toBeNull();
    expect(Object.prototype.hasOwnProperty.call(snapshot, 'userLocation')).toBe(true);
    expect(snapshot?.userLocation).toBeNull();
  });
});
