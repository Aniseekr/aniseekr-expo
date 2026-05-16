import { describe, expect, it } from 'bun:test';

import { buildNearbySpots } from '../../../libs/services/pilgrimage/nearby-spots';
import type { AnitabiBangumi, AnitabiPoint } from '../../../libs/services/pilgrimage/types';

function point(
  id: string,
  name: string,
  geo: [number, number],
  ep = 1
): AnitabiPoint {
  return { id, name, image: `https://img/${id}.jpg`, ep, s: 0, geo };
}

function bangumi(id: number, litePoints: AnitabiPoint[], over: Partial<AnitabiBangumi> = {}): AnitabiBangumi {
  return {
    id,
    cn: `动画${id}`,
    title: `Anime ${id}`,
    city: '',
    cover: '',
    color: '#abcdef',
    geo: [35, 139],
    zoom: 12,
    modified: 0,
    litePoints,
    pointsLength: litePoints.length,
    imagesLength: litePoints.length,
    ...over,
  };
}

// Central Tokyo — distances grow as points move east/north.
const USER = { latitude: 35.68, longitude: 139.76 };

describe('buildNearbySpots', () => {
  it('sorts spots nearest-first and tags them with the user distance', () => {
    const near = bangumi(1, [point('a', 'Near shrine', [35.69, 139.77])]);
    const far = bangumi(2, [point('b', 'Far station', [35.9, 140.1])]);

    const spots = buildNearbySpots([far, near], USER);

    expect(spots.map((s) => s.id)).toEqual(['a', 'b']);
    expect(spots[0].distanceKm).toBeLessThan(spots[1].distanceKm);
    expect(spots[0].distanceKm).toBeGreaterThan(0);
  });

  it('builds map-unique marker ids and carries anime context', () => {
    const spots = buildNearbySpots(
      [bangumi(42, [point('p1', 'Café', [35.681, 139.761])])],
      USER
    );

    expect(spots[0].markerId).toBe('42:p1');
    expect(spots[0].animeId).toBe(42);
    expect(spots[0].animeTitle).toBe('动画42');
    expect(spots[0].ringColor).toBe('#abcdef');
  });

  it('collapses scene-cuts of one location into a single spot with a scene count', () => {
    // Three cuts of the same shrine (same name, within 60 m) → one spot.
    const cuts = [
      point('c1', '伏見稲荷', [35.6829, 139.7601]),
      point('c2', '伏見稲荷', [35.68291, 139.76011]),
      point('c3', '伏見稲荷', [35.68292, 139.76012]),
    ];
    const spots = buildNearbySpots([bangumi(7, cuts)], USER);

    expect(spots).toHaveLength(1);
    expect(spots[0].sceneCount).toBe(3);
  });

  it('skips null payloads and points with no real geo', () => {
    const withBadGeo = bangumi(3, [
      point('ok', 'Real place', [35.682, 139.762]),
      point('bad', 'Missing geo', [0, 0]),
    ]);

    const spots = buildNearbySpots([null, undefined, withBadGeo], USER);

    expect(spots.map((s) => s.id)).toEqual(['ok']);
  });

  it('caps the result at maxSpots', () => {
    const many = bangumi(
      9,
      Array.from({ length: 12 }, (_, i) =>
        point(`s${i}`, `Spot ${i}`, [35.68 + i * 0.01, 139.76])
      )
    );

    expect(buildNearbySpots([many], USER, 5)).toHaveLength(5);
  });
});
