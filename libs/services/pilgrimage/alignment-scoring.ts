// Real-time alignment scoring for the pilgrimage compare flow.
// Given GPS + compass + tilt readings, produce 0..1 sub-scores and a weighted
// total. Any missing sensor → corresponding score is null and `total` is null
// (CLAUDE.md Rule 8 — no fake fallback values).

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

/** Distance (m) at which the position score collapses to 0. */
export const POSITION_FULL_RADIUS_M = 30;

/** Tilt (deg) at which the tilt score collapses to 0. */
export const TILT_FULL_ANGLE_DEG = 45;

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

export function computeAlignmentScore(s: AlignmentSensors): AlignmentScore {
  let position: number | null = null;
  let distanceMeters: number | null = null;
  if (s.userLocation && s.targetLocation) {
    const km = locationService.getDistanceKm(s.userLocation, s.targetLocation);
    if (Number.isFinite(km)) {
      distanceMeters = km * 1000;
      position = clamp01(1 - distanceMeters / POSITION_FULL_RADIUS_M);
    }
  }

  let heading: number | null = null;
  let headingDeltaDeg: number | null = null;
  if (s.heading !== null && s.targetBearing !== null) {
    headingDeltaDeg = shortestArcDelta(s.heading, s.targetBearing);
    heading = clamp01(1 - Math.abs(headingDeltaDeg) / 180);
  }

  let tilt: number | null = null;
  if (s.tilt !== null) {
    tilt = clamp01(1 - Math.abs(s.tilt) / TILT_FULL_ANGLE_DEG);
  }

  const ready = position !== null && heading !== null && tilt !== null;
  const total = ready
    ? (position as number) * WEIGHTS.position +
      (heading as number) * WEIGHTS.heading +
      (tilt as number) * WEIGHTS.tilt
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
