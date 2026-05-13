import { describe, expect, it } from 'bun:test';
import { getWalkDirections } from '../../libs/services/pilgrimage/walk-directions';
import type { AlignmentSensors } from '../../libs/services/pilgrimage/alignment-scoring';

const METERS_PER_DEG_LAT = (6371 * Math.PI) / 180 * 1000;

function locOffsetMeters(meters: number) {
  return {
    user: { latitude: 0, longitude: 0 },
    target: { latitude: meters / METERS_PER_DEG_LAT, longitude: 0 },
  };
}

function base(overrides: Partial<AlignmentSensors> = {}): AlignmentSensors {
  return {
    userLocation: null,
    targetLocation: null,
    heading: null,
    targetBearing: null,
    tilt: null,
    ...overrides,
  };
}

describe('getWalkDirections — missing inputs', () => {
  it('returns null for every cue when nothing is provided', () => {
    expect(getWalkDirections(base())).toEqual({
      distanceText: null,
      headingText: null,
      tiltText: null,
    });
  });

  it('returns null distanceText when only one location is available', () => {
    const r = getWalkDirections(
      base({ userLocation: { latitude: 0, longitude: 0 } })
    );
    expect(r.distanceText).toBeNull();
  });

  it('returns null headingText when only heading or only targetBearing is set', () => {
    expect(getWalkDirections(base({ heading: 90 })).headingText).toBeNull();
    expect(
      getWalkDirections(base({ targetBearing: 90 })).headingText
    ).toBeNull();
  });
});

describe('getWalkDirections — distance buckets', () => {
  it('uses 再走 …m above 100m', () => {
    const o = locOffsetMeters(150);
    expect(
      getWalkDirections(base({ userLocation: o.user, targetLocation: o.target }))
        .distanceText
    ).toBe('再走 150 m');
  });

  it('uses 向前走 …m between 5m and 100m', () => {
    const o = locOffsetMeters(40);
    expect(
      getWalkDirections(base({ userLocation: o.user, targetLocation: o.target }))
        .distanceText
    ).toBe('向前走 40 m');
  });

  it('uses generic 再前進一兩步 between 1m and 5m', () => {
    const o = locOffsetMeters(3);
    expect(
      getWalkDirections(base({ userLocation: o.user, targetLocation: o.target }))
        .distanceText
    ).toBe('再前進一兩步');
  });

  it('returns null distance when within 1m', () => {
    const same = { latitude: 35.6586, longitude: 139.7454 };
    expect(
      getWalkDirections(base({ userLocation: same, targetLocation: { ...same } }))
        .distanceText
    ).toBeNull();
  });

  it('at the 100m boundary still uses 向前走 (>100 is the trigger)', () => {
    const o = locOffsetMeters(100);
    expect(
      getWalkDirections(base({ userLocation: o.user, targetLocation: o.target }))
        .distanceText
    ).toBe('向前走 100 m');
  });
});

describe('getWalkDirections — heading cues', () => {
  it('returns null when heading delta is within 5°', () => {
    expect(
      getWalkDirections(base({ heading: 100, targetBearing: 103 })).headingText
    ).toBeNull();
  });

  it('says 向右轉 when target is clockwise of current heading', () => {
    expect(
      getWalkDirections(base({ heading: 0, targetBearing: 30 })).headingText
    ).toBe('向右轉 30°');
  });

  it('says 向左轉 when target is counter-clockwise of current heading', () => {
    expect(
      getWalkDirections(base({ heading: 30, targetBearing: 0 })).headingText
    ).toBe('向左轉 30°');
  });

  it('handles compass wrap (heading 350 → target 10 = turn right ~20°)', () => {
    expect(
      getWalkDirections(base({ heading: 350, targetBearing: 10 })).headingText
    ).toBe('向右轉 20°');
  });
});

describe('getWalkDirections — tilt cues', () => {
  it('returns null when tilt is within 5°', () => {
    expect(getWalkDirections(base({ tilt: 2 })).tiltText).toBeNull();
    expect(getWalkDirections(base({ tilt: -3 })).tiltText).toBeNull();
  });

  it('says 抬高 when tilt is positive (phone tipped too low)', () => {
    expect(getWalkDirections(base({ tilt: 15 })).tiltText).toBe('稍微抬高手機');
  });

  it('says 放平 when tilt is negative (phone tipped too far back)', () => {
    expect(getWalkDirections(base({ tilt: -15 })).tiltText).toBe('手機放平一些');
  });
});
