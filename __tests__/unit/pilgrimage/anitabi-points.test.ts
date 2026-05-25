// Unit tests for the Anitabi /points normaliser + grouping helper.

import { describe, expect, it } from 'bun:test';
import {
  groupPointsIntoSpots,
  normalizeRawPoints,
} from '../../../libs/services/pilgrimage/anitabi-points';
import type { AnitabiPoint, RawAnitabiPoint } from '../../../libs/services/pilgrimage/types';

const BANGUMI_ID = 7157;

function point(
  over: Partial<AnitabiPoint> & Pick<AnitabiPoint, 'id' | 'name' | 'geo'>
): AnitabiPoint {
  return { image: 'https://image.anitabi.cn/x.jpg', ep: 1, s: 0, ...over };
}

describe('normalizeRawPoints', () => {
  it('coerces ep/s from numeric strings, empty strings, and null', () => {
    const raw: RawAnitabiPoint[] = [
      { id: 'a', name: 'A', image: '/images/points/7157/a.jpg', ep: '4', s: '1090', geo: [1, 2] },
      { id: 'b', name: 'B', image: '/images/points/7157/b.jpg', ep: '', s: null, geo: [1, 2] },
      { id: 'c', name: 'C', image: '/images/points/7157/c.jpg', ep: 9, s: 655, geo: [1, 2] },
    ];
    const out = normalizeRawPoints(raw, BANGUMI_ID);
    expect(out.map((p) => p.ep)).toEqual([4, 0, 9]);
    expect(out.map((p) => p.s)).toEqual([1090, 0, 655]);
  });

  it('resolves relative /images/ paths to absolute CDN URLs', () => {
    const out = normalizeRawPoints(
      [{ id: 'a', name: 'A', image: '/images/points/7157/a.jpg', geo: [1, 2] }],
      BANGUMI_ID
    );
    expect(out[0].image).toBe('https://image.anitabi.cn/points/7157/a.jpg?plan=h160');
  });

  it('drops points with no image, id, or name', () => {
    const raw: RawAnitabiPoint[] = [
      { id: 'a', name: 'A', image: '/images/points/7157/a.jpg', geo: [1, 2] },
      { id: 'noimg', name: 'NoImage', geo: [1, 2] },
      { id: 'emptyimg', name: 'EmptyImage', image: '   ', geo: [1, 2] },
      { id: '', name: 'NoId', image: '/images/x.jpg', geo: [1, 2] },
      { id: 'noname', name: '   ', image: '/images/x.jpg', geo: [1, 2] },
    ];
    const out = normalizeRawPoints(raw, BANGUMI_ID);
    expect(out.map((p) => p.id)).toEqual(['a']);
  });

  it('carries origin and originURL through, trimming and dropping empties', () => {
    const raw: RawAnitabiPoint[] = [
      {
        id: 'a',
        name: 'A',
        image: '/x.jpg',
        geo: [1, 2],
        origin: '  Google Maps  ',
        originURL: '  https://example.com/x  ',
      },
      { id: 'b', name: 'B', image: '/x.jpg', geo: [1, 2], origin: '' },
      { id: 'c', name: 'C', image: '/x.jpg', geo: [1, 2] },
    ];
    const out = normalizeRawPoints(raw, BANGUMI_ID);
    expect(out[0].origin).toBe('Google Maps');
    expect(out[0].originURL).toBe('https://example.com/x');
    expect(out[1].origin).toBeUndefined();
    expect(out[1].originURL).toBeUndefined();
    expect(out[2].origin).toBeUndefined();
  });

  it('carries fid and isFolder through', () => {
    const raw: RawAnitabiPoint[] = [
      { id: 'parent', name: 'Shrine', image: '/x.jpg', geo: [1, 2], isFolder: true },
      { id: 'child', name: 'Shrine', image: '/x.jpg', geo: [1, 2], fid: 'parent' },
    ];
    const out = normalizeRawPoints(raw, BANGUMI_ID);
    expect(out[0].isFolder).toBe(true);
    expect(out[0].fid).toBeUndefined();
    expect(out[1].fid).toBe('parent');
    expect(out[1].isFolder).toBeUndefined();
  });

  it('returns [] for non-array input', () => {
    expect(normalizeRawPoints(undefined, BANGUMI_ID)).toEqual([]);
    expect(normalizeRawPoints(null, BANGUMI_ID)).toEqual([]);
  });

  it('coerces malformed geo to [0,0]', () => {
    const out = normalizeRawPoints(
      [{ id: 'a', name: 'A', image: '/x.jpg', geo: 'nope' }],
      BANGUMI_ID
    );
    expect(out[0].geo).toEqual([0, 0]);
  });
});

describe('groupPointsIntoSpots', () => {
  it('returns [] for empty input', () => {
    expect(groupPointsIntoSpots([])).toEqual([]);
  });

  it('groups an Anitabi folder (parent + children) into one spot, parent first', () => {
    const points: AnitabiPoint[] = [
      point({ id: 'parent', name: '樺崎八幡宮', geo: [36.3618, 139.4948], isFolder: true }),
      point({ id: 'c1', name: '樺崎八幡宮', geo: [36.3618, 139.4949], fid: 'parent' }),
      point({ id: 'c2', name: '樺崎八幡宮', geo: [36.3619, 139.4948], fid: 'parent' }),
    ];
    const spots = groupPointsIntoSpots(points);
    expect(spots.length).toBe(1);
    expect(spots[0].id).toBe('parent');
    expect(spots[0].scenes.map((s) => s.id)).toEqual(['parent', 'c1', 'c2']);
  });

  it('groups orphan folder children (fid present, parent absent)', () => {
    const points: AnitabiPoint[] = [
      point({ id: 'c1', name: 'Shrine', geo: [36.3, 139.4], fid: 'missing' }),
      point({ id: 'c2', name: 'Shrine', geo: [36.3, 139.4], fid: 'missing' }),
    ];
    const spots = groupPointsIntoSpots(points);
    expect(spots.length).toBe(1);
    expect(spots[0].scenes.map((s) => s.id)).toEqual(['c1', 'c2']);
  });

  it('merges same-name points within 60m when Anitabi gives no folders', () => {
    const points: AnitabiPoint[] = [
      point({ id: 'a', name: 'まかいの牧場', geo: [35.336268, 138.58397] }),
      point({ id: 'b', name: 'まかいの牧場', geo: [35.336547, 138.584249] }), // ~40m
    ];
    const spots = groupPointsIntoSpots(points);
    expect(spots.length).toBe(1);
    expect(spots[0].scenes.length).toBe(2);
  });

  it('uses the Chinese title as the grouping key when Anitabi sends a non-string name', () => {
    const points: AnitabiPoint[] = [
      point({
        id: 'a',
        name: 556 as unknown as string,
        cn: '山梨县立图书馆',
        geo: [35.6683, 138.5702],
      }),
      point({
        id: 'b',
        name: 557 as unknown as string,
        cn: '山梨县立图书馆',
        geo: [35.66831, 138.57021],
      }),
    ];

    const spots = groupPointsIntoSpots(points);

    expect(spots.length).toBe(1);
    expect(spots[0].scenes.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('keeps same-name points apart when further than 60m', () => {
    const points: AnitabiPoint[] = [
      point({ id: 'a', name: '通学路', geo: [35.0, 139.0] }),
      point({ id: 'b', name: '通学路', geo: [35.002, 139.0] }), // ~222m
    ];
    expect(groupPointsIntoSpots(points).length).toBe(2);
  });

  it('keeps differently-named points at the same coordinate apart', () => {
    const points: AnitabiPoint[] = [
      point({ id: 'a', name: 'Cafe', geo: [35.0, 139.0] }),
      point({ id: 'b', name: 'Station', geo: [35.0, 139.0] }),
    ];
    expect(groupPointsIntoSpots(points).length).toBe(2);
  });

  it('does not proximity-merge points with missing ([0,0]) geo', () => {
    const points: AnitabiPoint[] = [
      point({ id: 'a', name: 'Unknown', geo: [0, 0] }),
      point({ id: 'b', name: 'Unknown', geo: [0, 0] }),
    ];
    expect(groupPointsIntoSpots(points).length).toBe(2);
  });

  it('preserves source order across folder + loose groups', () => {
    const points: AnitabiPoint[] = [
      point({ id: 'loose1', name: 'First', geo: [35.0, 139.0] }),
      point({ id: 'parent', name: 'Folder', geo: [35.1, 139.1], isFolder: true }),
      point({ id: 'child', name: 'Folder', geo: [35.1, 139.1], fid: 'parent' }),
      point({ id: 'loose2', name: 'Last', geo: [35.2, 139.2] }),
    ];
    const spots = groupPointsIntoSpots(points);
    expect(spots.map((s) => s.id)).toEqual(['loose1', 'parent', 'loose2']);
  });

  it('takes representative fields from scenes[0] (the folder parent)', () => {
    const points: AnitabiPoint[] = [
      point({
        id: 'parent',
        name: '樺崎八幡宮（かばさきはちまんぐう）',
        cn: '桦崎八幡宫',
        geo: [36.36, 139.49],
        image: 'https://img/parent.jpg',
        isFolder: true,
      }),
      point({ id: 'child', name: '樺崎八幡宮', geo: [36.36, 139.49], fid: 'parent' }),
    ];
    const spot = groupPointsIntoSpots(points)[0];
    expect(spot.name).toBe('樺崎八幡宮（かばさきはちまんぐう）');
    expect(spot.cn).toBe('桦崎八幡宫');
    expect(spot.image).toBe('https://img/parent.jpg');
  });

  it('treats single ungrouped points as one-scene spots', () => {
    const points: AnitabiPoint[] = [
      point({ id: 'solo', name: 'Lone Spot', geo: [35.0, 139.0] }),
    ];
    const spots = groupPointsIntoSpots(points);
    expect(spots.length).toBe(1);
    expect(spots[0].scenes.length).toBe(1);
    expect(spots[0].id).toBe('solo');
  });
});
