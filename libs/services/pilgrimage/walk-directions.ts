// Walk-direction coaching cues derived from the same sensor bundle used by
// `computeAlignmentScore`. Returns `null` for any cue we can't compute — the
// UI must render real loading / unavailable states (CLAUDE.md Rule 8).

import { locationService } from './location-service';
import type { AlignmentSensors } from './alignment-scoring';

export interface WalkDirection {
  distanceText: string | null;
  headingText: string | null;
  tiltText: string | null;
}

function shortestArcDelta(from: number, to: number): number {
  let d = ((to - from + 540) % 360) - 180;
  if (d <= -180) d += 360;
  return d;
}

export function getWalkDirections(s: AlignmentSensors): WalkDirection {
  let distanceText: string | null = null;
  if (s.userLocation && s.targetLocation) {
    const km = locationService.getDistanceKm(s.userLocation, s.targetLocation);
    if (Number.isFinite(km)) {
      const dist = km * 1000;
      if (dist > 100) {
        distanceText = `再走 ${Math.round(dist)} m`;
      } else if (dist > 5) {
        distanceText = `向前走 ${Math.round(dist)} m`;
      } else if (dist > 1) {
        distanceText = '再前進一兩步';
      }
    }
  }

  let headingText: string | null = null;
  if (s.heading !== null && s.targetBearing !== null) {
    const delta = shortestArcDelta(s.heading, s.targetBearing);
    if (Math.abs(delta) >= 5) {
      const mag = Math.round(Math.abs(delta));
      headingText = delta > 0 ? `向右轉 ${mag}°` : `向左轉 ${mag}°`;
    }
  }

  let tiltText: string | null = null;
  if (s.tilt !== null) {
    if (Math.abs(s.tilt) >= 5) {
      tiltText = s.tilt > 0 ? '稍微抬高手機' : '手機放平一些';
    }
  }

  return { distanceText, headingText, tiltText };
}
