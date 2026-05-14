// Frame match — does the user's captured photo actually look like the anime
// reference frame? Complements alignment-scoring.ts (which only tells us if
// the user stood in the right spot and faced the right direction).
//
// Without this signal we shipped a "Match 80%" score that was true even when
// the camera was covered with a thumb. See CLAUDE.md Rule 8 — the UI must not
// claim to know something it doesn't.
//
// We reuse the existing feature extractor (`scene-analysis-skia.analyzeImage`
// → 64×64 GPU downsample → SceneAnalysis with histogram, edge magnitude,
// brightness, contrast). No new GPU pipeline.

import { analyzeImage } from './scene-analysis-skia';
import type { SceneAnalysis } from './scene-analysis';

export type FrameMatchReason = 'dark' | 'lowDetail' | 'lowContrast' | 'analysisFailed';

export interface FrameMatch {
  /** 0..1, Bhattacharyya coefficient on the 16-bin luminance histogram. */
  histogram: number | null;
  /** 0..1, similarity of normalized Sobel edge magnitude. */
  edge: number | null;
  /** 0..1, brightness + contrast similarity (lower weight; day/night drift is legitimate). */
  lighting: number | null;
  /** 0..1, weighted total. Capped at 0.10 when validity gate trips. */
  total: number | null;
  /**
   * False when the user shot looks "obviously broken" (lens covered, completely
   * flat, no detail). UI must surface a red banner instead of letting the
   * (capped) score look like a real match.
   */
  valid: boolean;
  /** Why the validity gate tripped, or null when valid. */
  reason: FrameMatchReason | null;
}

/** User-image features below these thresholds trigger the validity gate. */
export const DARK_BRIGHTNESS_FLOOR = 0.05;
export const LOW_DETAIL_EDGE_FLOOR = 0.03;
export const LOW_CONTRAST_FLOOR = 0.05;

/** Sub-score weights for the total. */
export const FRAME_MATCH_WEIGHTS = { histogram: 0.55, edge: 0.30, lighting: 0.15 };

/** Cap applied to `total` when the validity gate trips. */
export const INVALID_MAX_TOTAL = 0.1;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * Pure scoring step — given two analyses, compute the frame-match score.
 * Exported so tests can exercise the math without booting Skia.
 */
export function scoreFrameMatch(ref: SceneAnalysis, user: SceneAnalysis): FrameMatch {
  // Histogram — Bhattacharyya coefficient. Both histograms already sum to ~1.
  // BC = Σ √(p_i · q_i) ∈ [0, 1]. 1 = identical distributions.
  let histogram = 0;
  const n = Math.min(ref.luminanceHistogram.length, user.luminanceHistogram.length);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, ref.luminanceHistogram[i]);
    const b = Math.max(0, user.luminanceHistogram[i]);
    histogram += Math.sqrt(a * b);
  }
  histogram = clamp01(histogram);

  // Edge density similarity. Both inputs are already normalized to [0, 1] by
  // reducePixels (capped at busy=1). Identical magnitude → 1; full gap → 0.
  const edge = clamp01(1 - Math.abs(ref.edgeMagnitude - user.edgeMagnitude));

  // Lighting — soft signal. Brightness and contrast are both 0..1.
  const dBright = Math.abs(ref.brightness - user.brightness);
  const dContrast = Math.abs(ref.contrast - user.contrast);
  const lighting = clamp01(1 - 0.5 * dBright - 0.5 * dContrast);

  let total =
    histogram * FRAME_MATCH_WEIGHTS.histogram +
    edge * FRAME_MATCH_WEIGHTS.edge +
    lighting * FRAME_MATCH_WEIGHTS.lighting;
  total = clamp01(total);

  // Validity gate — only the user image is inspected (reference is, by
  // construction, a real frame). Order: dark → lowDetail → lowContrast so the
  // banner picks the most actionable explanation.
  let valid = true;
  let reason: FrameMatchReason | null = null;
  if (user.brightness < DARK_BRIGHTNESS_FLOOR) {
    valid = false;
    reason = 'dark';
  } else if (user.edgeMagnitude < LOW_DETAIL_EDGE_FLOOR) {
    valid = false;
    reason = 'lowDetail';
  } else if (user.contrast < LOW_CONTRAST_FLOOR) {
    valid = false;
    reason = 'lowContrast';
  }

  if (!valid) total = Math.min(total, INVALID_MAX_TOTAL);

  return { histogram, edge, lighting, total, valid, reason };
}

/**
 * Compute the frame match between an anime reference URL and a captured photo
 * URI. Both images are decoded + downsampled to 64×64 via Skia.
 * Returns a `FrameMatch` whose fields are all null and `valid = false` if
 * either decode fails (CLAUDE.md Rule 8 — never invent a number on failure).
 */
export async function computeFrameMatch(
  refImageUrl: string,
  userShotUri: string
): Promise<FrameMatch> {
  const [ref, user] = await Promise.all([analyzeImage(refImageUrl), analyzeImage(userShotUri)]);
  if (!ref || !user) {
    return {
      histogram: null,
      edge: null,
      lighting: null,
      total: null,
      valid: false,
      reason: 'analysisFailed',
    };
  }
  return scoreFrameMatch(ref, user);
}
