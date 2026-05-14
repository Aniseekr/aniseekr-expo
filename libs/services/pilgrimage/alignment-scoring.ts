// Real-time alignment scoring for the pilgrimage compare flow.
// Given GPS + compass + tilt readings, produce 0..1 sub-scores and a weighted
// total. Any missing sensor → corresponding score is null and `total` is null
// (CLAUDE.md Rule 8 — no fake fallback values).
//
// Curve: cos² falloff with a full-credit plateau and a hard zero boundary.
// The previous linear `1 − |x|/range` gave too much credit for offsets that
// put the target outside the camera FOV — e.g. heading 90° off scored 0.5 even
// though the target wasn't in frame at all. cos² collapses much faster while
// keeping a forgiving plateau for tiny sensor noise near zero.

import { locationService, type LatLng } from './location-service';

export interface AlignmentSensors {
  userLocation: LatLng | null;
  targetLocation: LatLng | null;
  heading: number | null; // 0–360, magnetic
  targetBearing: number | null; // 0–360
  tilt: number | null; // signed degrees, 0 = phone vertical / level
}

export interface AlignmentScore {
  position: number | null;
  heading: number | null;
  tilt: number | null;
  total: number | null;
  ready: boolean;
  distanceMeters: number | null;
  headingDeltaDeg: number | null;
}

/** Distance (m) ≤ this → position score = 1. */
export const POSITION_PERFECT_M = 5;
/** Distance (m) ≥ this → position score = 0. */
export const POSITION_FULL_RADIUS_M = 30;

/** Heading delta (deg) ≤ this → heading score = 1. */
export const HEADING_PERFECT_DEG = 5;
/** Heading delta (deg) ≥ this → heading score = 0. Sized to roughly half
 * a typical phone FOV so off-frame targets receive zero credit. */
export const HEADING_FULL_RANGE_DEG = 45;

/** Tilt (deg) ≤ this → tilt score = 1. */
export const TILT_PERFECT_DEG = 3;
/** Tilt (deg) ≥ this → tilt score = 0. */
export const TILT_FULL_ANGLE_DEG = 20;

/** Sub-score weights used when computing `total`. Must sum to 1. */
export const WEIGHTS = { position: 0.4, heading: 0.4, tilt: 0.2 };

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** Shortest-arc signed delta between two compass bearings, in [-180, 180]. */
function shortestArcDelta(from: number, to: number): number {
  let d = ((to - from + 540) % 360) - 180;
  // ((-180) + 540) % 360 - 180 = 180 — guard against the boundary.
  if (d <= -180) d += 360;
  return d;
}

/** cos² falloff: 1 on [0, perfect], 0 on [zeroAt, ∞), smooth between. */
function falloff(absOffset: number, perfect: number, zeroAt: number): number {
  if (!Number.isFinite(absOffset)) return 0;
  if (absOffset <= perfect) return 1;
  if (absOffset >= zeroAt) return 0;
  const t = (absOffset - perfect) / (zeroAt - perfect); // 0..1
  const c = Math.cos((Math.PI / 2) * t);
  return c * c;
}

/**
 * Score a captured sensor snapshot (distance / heading delta / tilt) with the
 * exact same curve `computeAlignmentScore` uses. Lets the preview / share UI
 * reproduce the same numbers without re-deriving them from raw sensors.
 *
 * Any null input → corresponding sub-score is null and `total` is null.
 */
export function scoreSnapshot(snap: {
  distanceMeters: number | null;
  headingDeltaDeg: number | null;
  tilt: number | null;
}): AlignmentScore {
  const position =
    snap.distanceMeters != null && Number.isFinite(snap.distanceMeters)
      ? falloff(Math.max(0, snap.distanceMeters), POSITION_PERFECT_M, POSITION_FULL_RADIUS_M)
      : null;
  const heading =
    snap.headingDeltaDeg != null && Number.isFinite(snap.headingDeltaDeg)
      ? falloff(Math.abs(snap.headingDeltaDeg), HEADING_PERFECT_DEG, HEADING_FULL_RANGE_DEG)
      : null;
  const tilt =
    snap.tilt != null && Number.isFinite(snap.tilt)
      ? falloff(Math.abs(snap.tilt), TILT_PERFECT_DEG, TILT_FULL_ANGLE_DEG)
      : null;
  const ready = position !== null && heading !== null && tilt !== null;
  const total = ready
    ? clamp01(
        (position as number) * WEIGHTS.position +
          (heading as number) * WEIGHTS.heading +
          (tilt as number) * WEIGHTS.tilt
      )
    : null;
  return {
    position,
    heading,
    tilt,
    total,
    ready,
    distanceMeters: snap.distanceMeters,
    headingDeltaDeg: snap.headingDeltaDeg,
  };
}

export function computeAlignmentScore(s: AlignmentSensors): AlignmentScore {
  let position: number | null = null;
  let distanceMeters: number | null = null;
  if (s.userLocation && s.targetLocation) {
    const km = locationService.getDistanceKm(s.userLocation, s.targetLocation);
    if (Number.isFinite(km)) {
      distanceMeters = km * 1000;
      position = falloff(distanceMeters, POSITION_PERFECT_M, POSITION_FULL_RADIUS_M);
    }
  }

  let heading: number | null = null;
  let headingDeltaDeg: number | null = null;
  if (s.heading !== null && s.targetBearing !== null) {
    headingDeltaDeg = shortestArcDelta(s.heading, s.targetBearing);
    heading = falloff(Math.abs(headingDeltaDeg), HEADING_PERFECT_DEG, HEADING_FULL_RANGE_DEG);
  }

  let tilt: number | null = null;
  if (s.tilt !== null) {
    tilt = falloff(Math.abs(s.tilt), TILT_PERFECT_DEG, TILT_FULL_ANGLE_DEG);
  }

  const ready = position !== null && heading !== null && tilt !== null;
  const total = ready
    ? clamp01(
        (position as number) * WEIGHTS.position +
          (heading as number) * WEIGHTS.heading +
          (tilt as number) * WEIGHTS.tilt
      )
    : null;

  return {
    position,
    heading,
    tilt,
    total,
    ready,
    distanceMeters,
    headingDeltaDeg,
  };
}
