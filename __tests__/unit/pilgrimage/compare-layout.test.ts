import { describe, expect, it } from 'bun:test';
import {
  FULL_MODE_FALLBACK_ASPECT,
  FULL_MODE_MAX_HEIGHT,
  FULL_MODE_MIN_HEIGHT,
  resolveFullModeStageHeight,
} from '../../../libs/services/pilgrimage/compare-layout';

describe('resolveFullModeStageHeight', () => {
  it('matches the shot aspect when both dimensions are known', () => {
    // Portrait shot — stage taller than wide.
    expect(resolveFullModeStageHeight(360, 3024, 4032)).toBeCloseTo(360 / (3024 / 4032), 4);
    // Landscape shot — stage shorter than wide.
    expect(resolveFullModeStageHeight(360, 4032, 3024)).toBeCloseTo(360 / (4032 / 3024), 4);
  });

  it('falls back to a cinematic 16:9 aspect when dims are missing or invalid', () => {
    // Width chosen so the unclamped 16:9 height (281.25) sits inside the
    // floor/ceiling, isolating the fallback math from the clamp.
    const expected = 500 / FULL_MODE_FALLBACK_ASPECT;
    expect(resolveFullModeStageHeight(500, null, null)).toBeCloseTo(expected, 4);
    expect(resolveFullModeStageHeight(500, undefined, 4032)).toBeCloseTo(expected, 4);
    expect(resolveFullModeStageHeight(500, 0, 4032)).toBeCloseTo(expected, 4);
    expect(resolveFullModeStageHeight(500, Number.NaN, 4032)).toBeCloseTo(expected, 4);
  });

  it('clamps extreme aspects so a panoramic or selfie crop cannot blow out the scroll layout', () => {
    // Extremely tall portrait — would otherwise overflow.
    expect(resolveFullModeStageHeight(360, 100, 10000)).toBe(FULL_MODE_MAX_HEIGHT);
    // Extremely wide panorama — would otherwise collapse.
    expect(resolveFullModeStageHeight(360, 10000, 100)).toBe(FULL_MODE_MIN_HEIGHT);
  });

  it('returns the floor height when the stage has not laid out yet', () => {
    expect(resolveFullModeStageHeight(0, 3024, 4032)).toBe(FULL_MODE_MIN_HEIGHT);
    expect(resolveFullModeStageHeight(Number.NaN, 3024, 4032)).toBe(FULL_MODE_MIN_HEIGHT);
  });
});
