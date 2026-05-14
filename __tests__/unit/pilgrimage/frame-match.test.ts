import { describe, expect, it } from 'bun:test';
import {
  DARK_BRIGHTNESS_FLOOR,
  FRAME_MATCH_WEIGHTS,
  INVALID_MAX_TOTAL,
  LOW_CONTRAST_FLOOR,
  LOW_DETAIL_EDGE_FLOOR,
  scoreFrameMatch,
} from '../../../libs/services/pilgrimage/frame-match';
import type { SceneAnalysis } from '../../../libs/services/pilgrimage/scene-analysis';

// Baseline neutral scene — mirrors __tests__/unit/pilgrimage/scene-analysis.test.ts
// so the math operates on shapes we know reducePixels emits in production.
function baseAnalysis(overrides: Partial<SceneAnalysis> = {}): SceneAnalysis {
  return {
    avgR: 150,
    avgG: 150,
    avgB: 150,
    brightness: 0.55,
    warmth: 0,
    saturation: 0.25,
    minLum: 20,
    maxLum: 230,
    contrast: 0.82,
    colorVariance: 0.32,
    topSkyR: 160,
    topSkyG: 170,
    topSkyB: 200,
    bottomGroundR: 130,
    bottomGroundG: 130,
    bottomGroundB: 120,
    horizonY: 0.5,
    leftLum: 0.55,
    rightLum: 0.55,
    centerLum: 0.55,
    cornerLum: 0.5,
    edgeCells: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4],
    edgeMagnitude: 0.4,
    verticalEdgeRatio: 0.5,
    highlightRatio: 0.02,
    shadowRatio: 0.02,
    luminanceHistogram: Array.from({ length: 16 }, () => 1 / 16),
    palette: ['#AABBCC', '#998877', '#665544', '#332211', '#FFEEDD'],
    ...overrides,
  };
}

// A black image: brightness 0, no edges, no contrast, histogram fully in bin 0.
function blackAnalysis(): SceneAnalysis {
  const hist = new Array(16).fill(0);
  hist[0] = 1;
  return baseAnalysis({
    avgR: 0,
    avgG: 0,
    avgB: 0,
    brightness: 0,
    contrast: 0,
    edgeMagnitude: 0,
    minLum: 0,
    maxLum: 0,
    colorVariance: 0,
    saturation: 0,
    centerLum: 0,
    cornerLum: 0,
    leftLum: 0,
    rightLum: 0,
    edgeCells: new Array(9).fill(0),
    highlightRatio: 0,
    shadowRatio: 1,
    luminanceHistogram: hist,
    palette: ['#000000'],
  });
}

// A flat-grey image (lens cap removed but staring at a uniform wall):
// medium brightness, but no edges and no contrast.
function flatGreyAnalysis(): SceneAnalysis {
  const hist = new Array(16).fill(0);
  hist[7] = 1;
  return baseAnalysis({
    brightness: 0.5,
    contrast: 0.02,
    edgeMagnitude: 0.005,
    minLum: 126,
    maxLum: 131,
    colorVariance: 0,
    saturation: 0,
    luminanceHistogram: hist,
  });
}

describe('scoreFrameMatch', () => {
  it('returns total ≈ 1 for identical analyses', () => {
    const ref = baseAnalysis();
    const user = baseAnalysis();
    const r = scoreFrameMatch(ref, user);
    expect(r.histogram).toBeCloseTo(1, 5);
    expect(r.edge).toBeCloseTo(1, 5);
    expect(r.lighting).toBeCloseTo(1, 5);
    expect(r.total).toBeCloseTo(1, 5);
    expect(r.valid).toBe(true);
    expect(r.reason).toBeNull();
  });

  it('caps total at INVALID_MAX_TOTAL when the user shot is a black image (dark)', () => {
    const ref = baseAnalysis();
    const user = blackAnalysis();
    const r = scoreFrameMatch(ref, user);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('dark');
    expect(r.total).not.toBeNull();
    expect(r.total ?? 1).toBeLessThanOrEqual(INVALID_MAX_TOTAL + 1e-9);
  });

  it('caps total when the user shot is detail-free (lowDetail)', () => {
    const ref = baseAnalysis();
    // Has brightness above the dark floor but ~zero edges → lowDetail.
    const user = baseAnalysis({
      brightness: 0.4,
      contrast: 0.3,
      edgeMagnitude: 0.0,
    });
    const r = scoreFrameMatch(ref, user);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('lowDetail');
    expect(r.total ?? 1).toBeLessThanOrEqual(INVALID_MAX_TOTAL + 1e-9);
  });

  it('caps total when the user shot is uniformly flat (lowContrast)', () => {
    const ref = baseAnalysis();
    const user = flatGreyAnalysis();
    // flatGreyAnalysis trips lowDetail before lowContrast (edge < 0.03).
    // Adjust so only the contrast floor is below threshold:
    const userOnlyLowContrast: SceneAnalysis = {
      ...user,
      edgeMagnitude: 0.2,
      contrast: 0.03,
    };
    const r = scoreFrameMatch(ref, userOnlyLowContrast);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('lowContrast');
    expect(r.total ?? 1).toBeLessThanOrEqual(INVALID_MAX_TOTAL + 1e-9);
  });

  it('keeps the image valid when every signal is above its floor', () => {
    const ref = baseAnalysis();
    const user = baseAnalysis({
      brightness: DARK_BRIGHTNESS_FLOOR + 0.01,
      edgeMagnitude: LOW_DETAIL_EDGE_FLOOR + 0.01,
      contrast: LOW_CONTRAST_FLOOR + 0.01,
    });
    const r = scoreFrameMatch(ref, user);
    expect(r.valid).toBe(true);
    expect(r.reason).toBeNull();
  });

  it('rewards histogram similarity even when exposure shifts', () => {
    // Same histogram shape, but the user is slightly darker overall.
    const histA = Array.from({ length: 16 }, (_, i) => (i === 5 || i === 6 ? 0.4 : 0.0125));
    const histB = Array.from({ length: 16 }, (_, i) => (i === 4 || i === 5 ? 0.4 : 0.0125));
    const ref = baseAnalysis({ luminanceHistogram: histA });
    const user = baseAnalysis({ luminanceHistogram: histB, brightness: 0.45 });
    const r = scoreFrameMatch(ref, user);
    // Histograms partially overlap in bin 5 → BC ≈ 0.4 + spread, not 1.
    expect(r.histogram ?? -1).toBeGreaterThan(0.2);
    expect(r.histogram ?? 2).toBeLessThan(1);
    expect(r.valid).toBe(true);
  });

  it('penalises a wildly different edge density', () => {
    const ref = baseAnalysis({ edgeMagnitude: 0.7 });
    const user = baseAnalysis({ edgeMagnitude: 0.1 });
    const r = scoreFrameMatch(ref, user);
    expect(r.edge ?? 2).toBeLessThan(0.5);
  });

  it('uses the documented weight mix to compute total', () => {
    const ref = baseAnalysis();
    const user = baseAnalysis();
    const r = scoreFrameMatch(ref, user);
    const recomputed =
      (r.histogram ?? 0) * FRAME_MATCH_WEIGHTS.histogram +
      (r.edge ?? 0) * FRAME_MATCH_WEIGHTS.edge +
      (r.lighting ?? 0) * FRAME_MATCH_WEIGHTS.lighting;
    expect(r.total).toBeCloseTo(recomputed, 5);
  });

  it('produces total = 0 for fully disjoint histograms and inverse exposure', () => {
    // Ref puts all weight in the bottom bins; user in the top bins → BC = 0.
    const refHist = Array.from({ length: 16 }, (_, i) => (i < 4 ? 0.25 : 0));
    const userHist = Array.from({ length: 16 }, (_, i) => (i >= 12 ? 0.25 : 0));
    const ref = baseAnalysis({
      luminanceHistogram: refHist,
      brightness: 0.1,
      contrast: 0.1,
      edgeMagnitude: 0.0,
    });
    const user = baseAnalysis({
      luminanceHistogram: userHist,
      brightness: 0.9,
      contrast: 0.9,
      edgeMagnitude: 1.0,
    });
    const r = scoreFrameMatch(ref, user);
    expect(r.histogram).toBeCloseTo(0, 5);
    expect(r.edge).toBeCloseTo(0, 5);
    // lighting: 1 − 0.5·0.8 − 0.5·0.8 = 0.2 → total still small
    expect(r.total ?? 1).toBeLessThan(0.05);
  });
});
