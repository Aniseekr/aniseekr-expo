import { describe, expect, it } from 'bun:test';
import {
  computeAlignmentScore,
  POSITION_FULL_RADIUS_M,
  TILT_FULL_ANGLE_DEG,
  WEIGHTS,
  type AlignmentSensors,
} from '../../libs/services/pilgrimage/alignment-scoring';

// One degree of latitude is ~111,194.93 m (R = 6371 km × π / 180).
const METERS_PER_DEG_LAT = (6371 * Math.PI) / 180 * 1000;

function locOffsetMeters(meters: number) {
  return {
    user: { latitude: 0, longitude: 0 },
    target: { latitude: meters / METERS_PER_DEG_LAT, longitude: 0 },
  };
}

function baseSensors(overrides: Partial<AlignmentSensors> = {}): AlignmentSensors {
  return {
    userLocation: null,
    targetLocation: null,
    heading: null,
    targetBearing: null,
    tilt: null,
    ...overrides,
  };
}

describe('computeAlignmentScore', () => {
  it('returns all-null and not-ready when every sensor is null', () => {
    const r = computeAlignmentScore(baseSensors());
    expect(r.position).toBeNull();
    expect(r.heading).toBeNull();
    expect(r.tilt).toBeNull();
    expect(r.total).toBeNull();
    expect(r.distanceMeters).toBeNull();
    expect(r.headingDeltaDeg).toBeNull();
    expect(r.ready).toBe(false);
  });

  it('reports a perfect alignment when location matches and heading == bearing and tilt is 0', () => {
    const loc = { latitude: 35.6586, longitude: 139.7454 };
    const r = computeAlignmentScore(
      baseSensors({
        userLocation: loc,
        targetLocation: { ...loc },
        heading: 123,
        targetBearing: 123,
        tilt: 0,
      })
    );
    expect(r.position).toBeCloseTo(1, 5);
    expect(r.heading).toBeCloseTo(1, 5);
    expect(r.tilt).toBeCloseTo(1, 5);
    expect(r.total).toBeCloseTo(1, 5);
    expect(r.ready).toBe(true);
    expect(r.distanceMeters).toBeCloseTo(0, 5);
    expect(r.headingDeltaDeg).toBe(0);
  });

  it('drops the position score to 0 at the full radius and to 1 at zero distance', () => {
    const far = locOffsetMeters(POSITION_FULL_RADIUS_M);
    const r0 = computeAlignmentScore(
      baseSensors({ userLocation: far.user, targetLocation: far.target })
    );
    expect(r0.position).toBeCloseTo(0, 5);
    expect(r0.distanceMeters).toBeCloseTo(POSITION_FULL_RADIUS_M, 1);

    const same = { latitude: 0, longitude: 0 };
    const r1 = computeAlignmentScore(
      baseSensors({ userLocation: same, targetLocation: same })
    );
    expect(r1.position).toBe(1);
  });

  it('returns ~0.5 position score at half the full radius', () => {
    const half = locOffsetMeters(POSITION_FULL_RADIUS_M / 2);
    const r = computeAlignmentScore(
      baseSensors({ userLocation: half.user, targetLocation: half.target })
    );
    expect(r.position ?? -1).toBeGreaterThanOrEqual(0.49);
    expect(r.position ?? -1).toBeLessThanOrEqual(0.51);
  });

  it('handles compass wrap so heading 350 / target 10 gives delta ≈ 20', () => {
    const r = computeAlignmentScore(
      baseSensors({ heading: 350, targetBearing: 10 })
    );
    expect(r.headingDeltaDeg).toBeCloseTo(20, 5);
    expect(r.heading).toBeCloseTo(1 - 20 / 180, 5);
  });

  it('reports a heading score of 0 when the user is facing 180 away', () => {
    const r = computeAlignmentScore(
      baseSensors({ heading: 0, targetBearing: 180 })
    );
    expect(r.heading).toBeCloseTo(0, 5);
    expect(Math.abs(r.headingDeltaDeg ?? 0)).toBe(180);
  });

  it('clamps tilt score at 0 for tilts at or beyond the full angle', () => {
    expect(
      computeAlignmentScore(baseSensors({ tilt: TILT_FULL_ANGLE_DEG })).tilt
    ).toBeCloseTo(0, 5);
    expect(computeAlignmentScore(baseSensors({ tilt: 90 })).tilt).toBe(0);
    expect(computeAlignmentScore(baseSensors({ tilt: -90 })).tilt).toBe(0);
  });

  it('treats negative tilt symmetrically', () => {
    const pos = computeAlignmentScore(baseSensors({ tilt: 22.5 }));
    const neg = computeAlignmentScore(baseSensors({ tilt: -22.5 }));
    expect(pos.tilt).toBeCloseTo(neg.tilt ?? -1, 5);
  });

  it('keeps total null and ready false when only one sensor is available', () => {
    const r = computeAlignmentScore(
      baseSensors({ heading: 12, targetBearing: 18 })
    );
    expect(r.heading).not.toBeNull();
    expect(r.position).toBeNull();
    expect(r.tilt).toBeNull();
    expect(r.total).toBeNull();
    expect(r.ready).toBe(false);
  });

  it('weights the sub-scores into total per WEIGHTS', () => {
    const half = locOffsetMeters(POSITION_FULL_RADIUS_M / 2); // position 0.5
    const r = computeAlignmentScore({
      userLocation: half.user,
      targetLocation: half.target,
      heading: 0,
      targetBearing: 90, // delta 90 → heading 0.5
      tilt: 0, // tilt 1
    });
    const expected =
      0.5 * WEIGHTS.position + 0.5 * WEIGHTS.heading + 1 * WEIGHTS.tilt;
    expect(r.total).toBeCloseTo(expected, 5);
  });
});
