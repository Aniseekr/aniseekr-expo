// Track C #5 of the composer pipeline plan (2026-05-26-composer-pipeline.md).
//
// Glue between scene analysis (`SceneAnalysis.avgR/G/B`) and the Skia
// ColorMatrix the share card paints. Two layers:
//
//   - `deriveAutoMatrixFromAnalysis(ref, user)` — pure, sync. Takes the RGB
//     averages we already pull out of a 64×64 downsample and returns the
//     Skia 4×5 matrix. This is the unit-tested core.
//
//   - `loadAutoColorMatrix(refUri, shotUri)` — async, calls `analyzeImage`
//     to decode both images via Skia, runs them through `reducePixels`, and
//     returns the matrix when ready. The share screen invokes this from a
//     React effect; the helper does no caching of its own because the
//     screen owns the (refUri, shotUri) lifecycle.

import { analyzeImage } from './scene-analysis-skia';
import type { SceneAnalysis } from './scene-analysis';
import { applyAutoColorMatrix, IDENTITY_COLOR_MATRIX } from './share-filters';

export type RgbMeanAnalysis = Pick<SceneAnalysis, 'avgR' | 'avgG' | 'avgB'>;

export { IDENTITY_COLOR_MATRIX };

/**
 * Convert two `SceneAnalysis`-shaped inputs into a 4×5 ColorMatrix. Refuses
 * to render a guess if either side is missing — per CLAUDE.md rule 8 we'd
 * rather show the original than fake a "match".
 */
export function deriveAutoMatrixFromAnalysis(
  ref: RgbMeanAnalysis | null | undefined,
  user: RgbMeanAnalysis | null | undefined
): number[] {
  if (!ref || !user) return IDENTITY_COLOR_MATRIX.slice();
  return applyAutoColorMatrix(
    { r: ref.avgR, g: ref.avgG, b: ref.avgB },
    { r: user.avgR, g: user.avgG, b: user.avgB }
  );
}

/**
 * Async URI → matrix path. Returns IDENTITY if either decode fails so the
 * caller renders the unaltered photo (real loading is signalled separately
 * via the returned `loaded` flag).
 */
export async function loadAutoColorMatrix(
  refUri: string,
  shotUri: string
): Promise<{ matrix: number[]; ref: SceneAnalysis | null; user: SceneAnalysis | null }> {
  const [refAnalysis, userAnalysis] = await Promise.all([
    analyzeImage(refUri),
    analyzeImage(shotUri),
  ]);
  return {
    matrix: deriveAutoMatrixFromAnalysis(refAnalysis, userAnalysis),
    ref: refAnalysis,
    user: userAnalysis,
  };
}
