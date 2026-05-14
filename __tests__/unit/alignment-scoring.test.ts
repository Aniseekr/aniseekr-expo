import { describe, expect, it } from 'bun:test';
import {
  computeAlignmentScore,
  HEADING_FULL_RANGE_DEG,
  HEADING_PERFECT_DEG,
  POSITION_FULL_RADIUS_M,
  POSITION_PERFECT_M,
  TILT_FULL_ANGLE_DEG,
  TILT_PERFECT_DEG,
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

// cos² falloff replicated for use in expected-value computations below.
function expectedFalloff(absOffset: number, perfect: number, zeroAt: number): number {
  if (absOffset <= perfect) return 1;
  if (absOffset >= zeroAt) return 0;
  const t = (absOffset - perfect) / (zeroAt - perfect);
  const c = Math.cos((Math.PI / 2) * t);
  return c * c;
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

  it('plateaus at 1 on the full-credit radii and collapses to 0 at the boundaries', () => {
    // Boundary distance → position 0
    const far = locOffsetMeters(POSITION_FULL_RADIUS_M);
    const r0 = computeAlignmentScore(
      baseSensors({ userLocation: far.user, targetLocation: far.target })
    );
    expect(r0.position).toBeCloseTo(0, 5);
    expect(r0.distanceMeters).toBeCloseTo(POSITION_FULL_RADIUS_M, 1);

    // Distance within the perfect plateau → position 1
    const inside = locOffsetMeters(POSITION_PERFECT_M);
    const rIn = computeAlignmentScore(
      baseSensors({ userLocation: inside.user, targetLocation: inside.target })
    );
    expect(rIn.position).toBeCloseTo(1, 5);

    // Heading within perfect → 1; at boundary → 0
    expect(
      computeAlignmentScore(baseSensors({ heading: 0, targetBearing: HEADING_PERFECT_DEG })).heading
    ).toBeCloseTo(1, 5);
    expect(
      computeAlignmentScore(baseSensors({ heading: 0, targetBearing: HEADING_FULL_RANGE_DEG }))
        .heading
    ).toBeCloseTo(0, 5);

    // Tilt within perfect → 1; at boundary → 0
    expect(computeAlignmentScore(baseSensors({ tilt: TILT_PERFECT_DEG })).tilt).toBeCloseTo(1, 5);
    expect(computeAlignmentScore(baseSensors({ tilt: TILT_FULL_ANGLE_DEG })).tilt).toBeCloseTo(
      0,
      5
    );
  });

  it('uses cos² falloff between perfect and boundary', () => {
    // Distance halfway between perfect (5 m) and zero (30 m) → 17.5 m
    const midDist = (POSITION_PERFECT_M + POSITION_FULL_RADIUS_M) / 2;
    const mid = locOffsetMeters(midDist);
    const r = computeAlignmentScore(
      baseSensors({ userLocation: mid.user, targetLocation: mid.target })
    );
    expect(r.position).toBeCloseTo(
      expectedFalloff(midDist, POSITION_PERFECT_M, POSITION_FULL_RADIUS_M),
      5
    );

    // Heading 20° off
    const head20 = computeAlignmentScore(baseSensors({ heading: 0, targetBearing: 20 }));
    expect(head20.heading).toBeCloseTo(
      expectedFalloff(20, HEADING_PERFECT_DEG, HEADING_FULL_RANGE_DEG),
      5
    );
  });

  it('handles compass wrap so heading 350 / target 10 gives delta ≈ 20', () => {
    const r = computeAlignmentScore(
      baseSensors({ heading: 350, targetBearing: 10 })
    );
    expect(r.headingDeltaDeg).toBeCloseTo(20, 5);
    expect(r.heading).toBeCloseTo(
      expectedFalloff(20, HEADING_PERFECT_DEG, HEADING_FULL_RANGE_DEG),
      5
    );
  });

  it('reports a heading score of 0 well before 180° (FOV-aware falloff)', () => {
    // 90° heading off used to give 0.5 with the linear curve — but the target
    // isn't even in the viewfinder. cos² falloff with a 45° boundary collapses
    // it to 0. This is the headline bug-fix.
    const r90 = computeAlignmentScore(baseSensors({ heading: 0, targetBearing: 90 }));
    expect(r90.heading).toBeCloseTo(0, 5);

    const r180 = computeAlignmentScore(baseSensors({ heading: 0, targetBearing: 180 }));
    expect(r180.heading).toBeCloseTo(0, 5);
    expect(Math.abs(r180.headingDeltaDeg ?? 0)).toBe(180);
  });

  it('clamps tilt score at 0 for tilts at or beyond the full angle', () => {
    expect(
      computeAlignmentScore(baseSensors({ tilt: TILT_FULL_ANGLE_DEG })).tilt
    ).toBeCloseTo(0, 5);
    expect(computeAlignmentScore(baseSensors({ tilt: 90 })).tilt).toBe(0);
    expect(computeAlignmentScore(baseSensors({ tilt: -90 })).tilt).toBe(0);
  });

  it('treats negative tilt symmetrically', () => {
    const pos = computeAlignmentScore(baseSensors({ tilt: 10 }));
    const neg = computeAlignmentScore(baseSensors({ tilt: -10 }));
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
    const midDist = (POSITION_PERFECT_M + POSITION_FULL_RADIUS_M) / 2;
    const half = locOffsetMeters(midDist);
    const r = computeAlignmentScore({
      userLocation: half.user,
      targetLocation: half.target,
      heading: 0,
      targetBearing: 20, // heading: cos²-falloff between 5 and 45
      tilt: 0, // tilt 1
    });
    const pos = expectedFalloff(midDist, POSITION_PERFECT_M, POSITION_FULL_RADIUS_M);
    const head = expectedFalloff(20, HEADING_PERFECT_DEG, HEADING_FULL_RANGE_DEG);
    const expected =
      pos * WEIGHTS.position + head * WEIGHTS.heading + 1 * WEIGHTS.tilt;
    expect(r.total).toBeCloseTo(expected, 5);
  });

  it('hits total 1.0 anywhere inside the plateau and 0 at every boundary', () => {
    const insideLoc = locOffsetMeters(POSITION_PERFECT_M / 2);
    const inside = computeAlignmentScore({
      userLocation: insideLoc.user,
      targetLocation: insideLoc.target,
      heading: 0,
      targetBearing: HEADING_PERFECT_DEG - 1,
      tilt: TILT_PERFECT_DEG - 1,
    });
    expect(inside.total).toBeCloseTo(1, 5);

    const boundaryLoc = locOffsetMeters(POSITION_FULL_RADIUS_M);
    const boundary = computeAlignmentScore({
      userLocation: boundaryLoc.user,
      targetLocation: boundaryLoc.target,
      heading: 0,
      targetBearing: HEADING_FULL_RANGE_DEG,
      tilt: TILT_FULL_ANGLE_DEG,
    });
    expect(boundary.total).toBeCloseTo(0, 5);
  });
});
