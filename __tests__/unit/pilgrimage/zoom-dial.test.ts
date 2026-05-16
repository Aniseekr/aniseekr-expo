import { describe, expect, it } from 'bun:test';
import {
  SEGMENT_PX,
  buildDetents,
  dialSpanPx,
  dragPositionForTranslation,
  nearestDetent,
  positionForStop,
  positionForZoom,
  zoomForPosition,
  type StopZoomMap,
} from '../../../libs/services/pilgrimage/zoom-dial';
import type { FocalStop } from '../../../components/pilgrimage/camera/types';

// Mirrors useCameraZoom's STOP_TO_ZOOM (exponential inverse, ASSUMED_MAX=50):
//   zoom = ln(factor) / ln(50)
const STOP_ZOOM: StopZoomMap = {
  0.5: 0,
  1: 0,
  2: Math.log(2) / Math.log(50),
  3: Math.log(3) / Math.log(50),
};

describe('buildDetents', () => {
  it('lays digital-only stops out at equal pixel offsets', () => {
    const detents = buildDetents([1, 2, 3], STOP_ZOOM);
    expect(detents.map((d) => d.stop)).toEqual([1, 2, 3]);
    expect(detents.map((d) => d.px)).toEqual([0, SEGMENT_PX, SEGMENT_PX * 2]);
  });

  it('sorts and de-duplicates the stop list', () => {
    const detents = buildDetents([3, 1, 2, 1] as FocalStop[], STOP_ZOOM);
    expect(detents.map((d) => d.stop)).toEqual([1, 2, 3]);
  });

  it('forces the 0.5x ultrawide detent to zoom 0 (no digital sub-1x zoom)', () => {
    const detents = buildDetents([0.5, 1, 2, 3], STOP_ZOOM);
    expect(detents[0].stop).toBe(0.5);
    expect(detents[0].zoom).toBe(0);
    expect(detents[0].px).toBe(0);
    expect(detents[1].stop).toBe(1);
    expect(detents[1].px).toBe(SEGMENT_PX);
  });

  it('uses the real STOP_TO_ZOOM values for 2x / 3x', () => {
    const detents = buildDetents([1, 2, 3], STOP_ZOOM);
    expect(detents[1].zoom).toBeCloseTo(STOP_ZOOM[2], 10);
    expect(detents[2].zoom).toBeCloseTo(STOP_ZOOM[3], 10);
  });

  it('accepts a custom segment width', () => {
    const detents = buildDetents([1, 2, 3], STOP_ZOOM, 50);
    expect(detents.map((d) => d.px)).toEqual([0, 50, 100]);
  });
});

describe('dialSpanPx', () => {
  it('runs one extra segment past the last detent (the neutral tail)', () => {
    const detents = buildDetents([1, 2, 3], STOP_ZOOM);
    expect(dialSpanPx(detents)).toBe(SEGMENT_PX * 3);
  });

  it('is zero for an empty detent list', () => {
    expect(dialSpanPx([])).toBe(0);
  });
});

describe('dragPositionForTranslation', () => {
  it('inverts horizontal translation and clamps inside the dial span', () => {
    const span = SEGMENT_PX * 3;

    expect(dragPositionForTranslation(SEGMENT_PX, -24, span)).toBe(SEGMENT_PX + 24);
    expect(dragPositionForTranslation(SEGMENT_PX, 24, span)).toBe(SEGMENT_PX - 24);
    expect(dragPositionForTranslation(10, 999, span)).toBe(0);
    expect(dragPositionForTranslation(span - 10, -999, span)).toBe(span);
  });

  it('treats non-finite gesture values as a safe no-op', () => {
    expect(dragPositionForTranslation(Number.NaN, 10, SEGMENT_PX)).toBe(0);
    expect(dragPositionForTranslation(10, Number.NaN, SEGMENT_PX)).toBe(10);
    expect(dragPositionForTranslation(10, 5, Number.NaN)).toBe(0);
  });
});

describe('zoomForPosition / positionForZoom round-trip', () => {
  const detents = buildDetents([1, 2, 3], STOP_ZOOM);

  it('maps each detent position back to its exact zoom value', () => {
    for (const d of detents) {
      expect(zoomForPosition(d.px, detents)).toBeCloseTo(d.zoom, 10);
    }
  });

  it('maps each detent zoom back to its exact position', () => {
    for (const d of detents) {
      expect(positionForZoom(d.zoom, detents)).toBeCloseTo(d.px, 6);
    }
  });

  it('round-trips position -> zoom -> position across the whole strip', () => {
    const span = dialSpanPx(detents);
    for (let px = 0; px <= span; px += 7) {
      const z = zoomForPosition(px, detents);
      expect(positionForZoom(z, detents)).toBeCloseTo(px, 4);
    }
  });

  it('interpolates linearly within a segment (midpoint of 1x->2x gap)', () => {
    const mid = SEGMENT_PX / 2;
    const z = zoomForPosition(mid, detents);
    expect(z).toBeCloseTo((STOP_ZOOM[1] + STOP_ZOOM[2]) / 2, 10);
  });

  it('is monotonically increasing along the strip', () => {
    const span = dialSpanPx(detents);
    let prev = -1;
    for (let px = 0; px <= span; px += 4) {
      const z = zoomForPosition(px, detents);
      expect(z).toBeGreaterThanOrEqual(prev);
      prev = z;
    }
  });

  it('reaches full zoom (1) at the end of the neutral tail', () => {
    expect(zoomForPosition(dialSpanPx(detents), detents)).toBeCloseTo(1, 10);
  });
});

describe('zoomForPosition / positionForZoom clamping', () => {
  const detents = buildDetents([1, 2, 3], STOP_ZOOM);

  it('clamps negative positions to zoom 0', () => {
    expect(zoomForPosition(-200, detents)).toBe(0);
  });

  it('clamps positions past the span to zoom 1', () => {
    expect(zoomForPosition(99999, detents)).toBeCloseTo(1, 10);
  });

  it('clamps out-of-range zoom values to the strip span', () => {
    expect(positionForZoom(-5, detents)).toBe(0);
    expect(positionForZoom(5, detents)).toBeCloseTo(dialSpanPx(detents), 6);
  });

  it('returns 0 for an empty detent list', () => {
    expect(zoomForPosition(50, [])).toBe(0);
    expect(positionForZoom(0.5, [])).toBe(0);
  });
});

describe('zoomForPosition with a 0.5x ultrawide detent', () => {
  // 0.5x and 1x both map to zoom 0 — a degenerate first segment.
  const detents = buildDetents([0.5, 1, 2, 3], STOP_ZOOM);

  it('keeps zoom at 0 across the entire 0.5x->1x segment', () => {
    for (let px = 0; px <= SEGMENT_PX; px += 8) {
      expect(zoomForPosition(px, detents)).toBeCloseTo(0, 10);
    }
  });

  it('positionForZoom(0) snaps to the segment start (0.5x detent)', () => {
    expect(positionForZoom(0, detents)).toBe(0);
  });

  it('still round-trips for zoom values above 1x', () => {
    expect(positionForZoom(STOP_ZOOM[2], detents)).toBeCloseTo(SEGMENT_PX * 2, 6);
    expect(positionForZoom(STOP_ZOOM[3], detents)).toBeCloseTo(SEGMENT_PX * 3, 6);
  });
});

describe('nearestDetent', () => {
  const detents = buildDetents([1, 2, 3], STOP_ZOOM);

  it('returns the focal stop when the position is exactly on a detent', () => {
    expect(nearestDetent(0, detents)).toBe(1);
    expect(nearestDetent(SEGMENT_PX, detents)).toBe(2);
    expect(nearestDetent(SEGMENT_PX * 2, detents)).toBe(3);
  });

  it('snaps within tolerance', () => {
    expect(nearestDetent(SEGMENT_PX + 15, detents, 22)).toBe(2);
    expect(nearestDetent(SEGMENT_PX - 15, detents, 22)).toBe(2);
  });

  it('returns null when the nearest detent is beyond tolerance', () => {
    expect(nearestDetent(SEGMENT_PX / 2, detents, 22)).toBeNull();
  });

  it('returns null in the unlabeled neutral tail past the last detent', () => {
    expect(nearestDetent(SEGMENT_PX * 2 + 60, detents, 22)).toBeNull();
  });

  it('returns null for an empty detent list', () => {
    expect(nearestDetent(0, [], 22)).toBeNull();
  });

  it('respects a custom tolerance', () => {
    expect(nearestDetent(SEGMENT_PX / 2, detents, SEGMENT_PX)).toBe(1);
  });
});

describe('positionForStop', () => {
  const detents = buildDetents([0.5, 1, 2, 3], STOP_ZOOM);

  it('returns the pixel offset for a present stop', () => {
    expect(positionForStop(0.5, detents)).toBe(0);
    expect(positionForStop(1, detents)).toBe(SEGMENT_PX);
    expect(positionForStop(3, detents)).toBe(SEGMENT_PX * 3);
  });

  it('returns null for a stop not on the dial', () => {
    const digitalOnly = buildDetents([1, 2, 3], STOP_ZOOM);
    expect(positionForStop(0.5, digitalOnly)).toBeNull();
  });
});

describe('single-detent dial (front-facing camera)', () => {
  const detents = buildDetents([1], STOP_ZOOM);

  it('has a span of exactly one segment', () => {
    expect(dialSpanPx(detents)).toBe(SEGMENT_PX);
  });

  it('interpolates the tail from the detent zoom up to 1', () => {
    expect(zoomForPosition(0, detents)).toBeCloseTo(0, 10);
    expect(zoomForPosition(SEGMENT_PX, detents)).toBeCloseTo(1, 10);
    expect(zoomForPosition(SEGMENT_PX / 2, detents)).toBeCloseTo(0.5, 10);
  });

  it('round-trips position <-> zoom', () => {
    for (let px = 0; px <= SEGMENT_PX; px += 6) {
      const z = zoomForPosition(px, detents);
      expect(positionForZoom(z, detents)).toBeCloseTo(px, 4);
    }
  });
});
