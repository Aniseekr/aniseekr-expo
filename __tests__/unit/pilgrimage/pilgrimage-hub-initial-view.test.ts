import { describe, expect, it } from 'bun:test';

import {
  resolvePilgrimageHubInitialView,
  type PilgrimageHubInitialViewInput,
} from '../../../libs/services/pilgrimage/pilgrimage-hub-initial-view';
import { getAllIndexed } from '../../../libs/services/pilgrimage/anitabi-index';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';

const anime = (
  overrides: Partial<AnitabiBangumi> & Pick<AnitabiBangumi, 'id'>
): AnitabiBangumi => ({
  id: overrides.id,
  title: overrides.title ?? `Anime ${overrides.id}`,
  cn: overrides.cn ?? '',
  cover: overrides.cover ?? '',
  color: overrides.color ?? '#4488CC',
  city: overrides.city ?? '',
  geo: overrides.geo ?? [35.0, 135.0],
  zoom: overrides.zoom ?? 11,
  modified: overrides.modified ?? 0,
  litePoints: overrides.litePoints ?? [],
  pointsLength: overrides.pointsLength ?? 1,
  imagesLength: overrides.imagesLength ?? 0,
});

const resolve = (input: Partial<PilgrimageHubInitialViewInput> = {}) =>
  resolvePilgrimageHubInitialView({
    focusBangumiId: null,
    snapshot: null,
    ...input,
  });

describe('resolvePilgrimageHubInitialView', () => {
  it('uses the route focus anime when it exists in the sync index', () => {
    const focused = getAllIndexed()[0];
    expect(focused).toBeDefined();

    const view = resolve({ focusBangumiId: focused!.id });

    expect(view).toEqual({
      center: { lat: focused!.lat, lng: focused!.lng },
      zoom: 11,
    });
  });

  it('lets a route focus anime from the snapshot beat stronger fallback candidates', () => {
    const view = resolve({
      focusBangumiId: 9_999_999,
      fallbackFeaturedIds: [],
      snapshot: {
        updatedAt: 1,
        featuredAnimes: [
          anime({ id: 1, geo: [35.0, 135.0], pointsLength: 500 }),
          anime({ id: 9_999_999, geo: [36.0, 136.0], pointsLength: 1 }),
        ],
      },
    });

    expect(view).toEqual({ center: { lat: 36.0, lng: 136.0 }, zoom: 11 });
  });

  it('chooses the nearest snapshot anime when a Japan user location is already cached', () => {
    const view = resolve({
      snapshot: {
        updatedAt: 1,
        userLocation: { latitude: 35.66, longitude: 139.7 },
        featuredAnimes: [
          anime({ id: 1, geo: [34.98, 135.76], pointsLength: 500 }),
          anime({ id: 2, geo: [35.66, 139.7], pointsLength: 1 }),
        ],
      },
    });

    expect(view).toEqual({ center: { lat: 35.66, lng: 139.7 }, zoom: 11 });
  });

  it('chooses the strongest snapshot anime when no user location is cached', () => {
    const view = resolve({
      fallbackFeaturedIds: [],
      snapshot: {
        updatedAt: 1,
        featuredAnimes: [
          anime({ id: 1, geo: [35.0, 135.0], pointsLength: 1 }),
          anime({ id: 2, geo: [36.0, 136.0], pointsLength: 500 }),
        ],
      },
    });

    expect(view).toEqual({ center: { lat: 36.0, lng: 136.0 }, zoom: 11 });
  });

  it('uses a cached user location only when no anime candidate exists', () => {
    const view = resolve({
      fallbackFeaturedIds: [],
      snapshot: {
        updatedAt: 1,
        userLocation: { latitude: 35.68, longitude: 139.76 },
        featuredAnimes: [],
      },
    });

    expect(view).toEqual({ center: { lat: 35.68, lng: 139.76 }, zoom: 11 });
  });

  it('returns an empty view when there is no anime candidate and the cached user is outside Japan', () => {
    expect(
      resolve({
        fallbackFeaturedIds: [],
        snapshot: {
          updatedAt: 1,
          userLocation: { latitude: 25.04, longitude: 121.56 },
          featuredAnimes: [],
        },
      })
    ).toEqual({});
  });
});
