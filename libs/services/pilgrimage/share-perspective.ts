// Track C #8 of the composer pipeline plan (2026-05-26-composer-pipeline.md).
//
// Two pieces:
//   - Phase 2 foundation: `computeHomography(src, dst)` solves the standard
//     8-DOF projective transform that maps four source corners onto four
//     destination corners. Lives here so the (future) manual corner-pin
//     editor can be unit-tested without the gesture/Skia stack.
//
//   - Phase 1 user-facing: `tiltCorrectionTransform({ tiltDeg,
//     headingDeltaDeg })` returns a small RN `transform` array (with
//     `perspective` + `rotateX/Y`) that nudges the user shot to compensate
//     for the camera tilt/heading delta captured at shutter time.
//     Conservative — clamped to ±15° so an extreme reading can't fold the
//     image inside-out.

export type Pt = { x: number; y: number };

export type Homography = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export const IDENTITY_HOMOGRAPHY: Homography = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * Solve the homography H such that for each i ∈ [0..3], H · src[i] ≈ dst[i]
 * (using homogeneous coords). Standard direct-linear-transform setup —
 * 8 equations, 8 unknowns (h33 fixed to 1). Returns `null` if the system
 * is degenerate (e.g. three collinear source points).
 */
export function computeHomography(src: Pt[], dst: Pt[]): Homography | null {
  if (src.length !== 4 || dst.length !== 4) return null;
  // Build the 8×8 matrix A and 8-vector b.
  const A: number[][] = new Array(8);
  const b = new Array<number>(8);
  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i];
    const { x: dx, y: dy } = dst[i];
    A[2 * i] = [sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy];
    A[2 * i + 1] = [0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy];
    b[2 * i] = dx;
    b[2 * i + 1] = dy;
  }
  const solved = solveLinearSystem(A, b);
  if (!solved) return null;
  // solved = [h11, h12, h13, h21, h22, h23, h31, h32]; h33 = 1.
  return [
    solved[0], solved[1], solved[2],
    solved[3], solved[4], solved[5],
    solved[6], solved[7], 1,
  ];
}

/**
 * Gaussian elimination with partial pivoting. Returns `null` when the
 * pivot column is degenerate (matrix is singular).
 */
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const M: number[][] = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    let maxAbs = Math.abs(M[i][i]);
    for (let k = i + 1; k < n; k++) {
      const abs = Math.abs(M[k][i]);
      if (abs > maxAbs) {
        maxAbs = abs;
        maxRow = k;
      }
    }
    if (maxAbs < 1e-9) return null;
    if (maxRow !== i) {
      const tmp = M[i];
      M[i] = M[maxRow];
      M[maxRow] = tmp;
    }
    for (let k = i + 1; k < n; k++) {
      const factor = M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) M[k][j] -= factor * M[i][j];
    }
  }
  const x = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) sum -= M[i][j] * x[j];
    x[i] = sum / M[i][i];
  }
  return x;
}

/**
 * Lift a 3×3 homography to a CSS-compatible 4×4 `matrix3d(...)` string.
 * RN's native `transform: [{ matrix: ... }]` only accepts the literal 16
 * column-major numbers; emitting a CSS string lets web targets and tests
 * both compare round-trip with one assertion.
 */
export function homographyToCss(h: Homography | readonly number[]): string {
  // 3×3 → 4×4 column-major lift: drop into the (x, y, w) sub-block.
  // Source 3×3 is row-major [h11, h12, h13, h21, h22, h23, h31, h32, h33].
  const [h11, h12, h13, h21, h22, h23, h31, h32, h33] = h;
  // 4×4 column-major:
  //  col0 = [h11, h21, 0, h31]
  //  col1 = [h12, h22, 0, h32]
  //  col2 = [0,   0,   1, 0  ]
  //  col3 = [h13, h23, 0, h33]
  const m = [
    h11, h21, 0, h31,
    h12, h22, 0, h32,
    0,   0,   1, 0,
    h13, h23, 0, h33,
  ];
  return `matrix3d(${m.map(formatNum).join(',')})`;
}

function formatNum(n: number): string {
  if (Math.abs(n) < 1e-10) return '0';
  // Avoid scientific notation in the CSS string.
  return Number.isInteger(n) ? String(n) : n.toFixed(6).replace(/\.?0+$/, '');
}

// ----- auto-from-sensor (Phase 1 user-facing) -----

export type TiltSensorReading = {
  /** Signed degrees; 0 means phone level. Positive = top tipped forward. */
  tiltDeg: number | null;
  /** Heading delta from anchor (deg). 0 means perfectly facing. */
  headingDeltaDeg: number | null;
};

export type RNPerspectiveTransform = (
  | { perspective: number }
  | { rotateX: string }
  | { rotateY: string }
)[];

const MAX_TILT_CORRECTION_DEG = 15;
const PERSPECTIVE_DEPTH = 800;

function clampDeg(n: number, max: number): number {
  if (n > max) return max;
  if (n < -max) return -max;
  return n;
}

/**
 * Build a small RN transform array that nudges the user shot to compensate
 * for the captured tilt/heading delta. The sign convention:
 *
 *   tiltDeg > 0  → phone was tipping forward  → rotateX *negative* to lift.
 *   headingΔ > 0 → camera was rotated right of anchor → rotateY *negative*.
 *
 * Returns an empty array (no transform) when either reading is missing so
 * the share card stays at frame-1 paint with no surprise distortion.
 */
export function tiltCorrectionTransform(reading: TiltSensorReading): RNPerspectiveTransform {
  const { tiltDeg, headingDeltaDeg } = reading;
  if (tiltDeg == null || headingDeltaDeg == null) return [];
  if (!Number.isFinite(tiltDeg) || !Number.isFinite(headingDeltaDeg)) return [];
  if (tiltDeg === 0 && headingDeltaDeg === 0) return [];
  const rx = clampDeg(-tiltDeg, MAX_TILT_CORRECTION_DEG);
  const ry = clampDeg(-headingDeltaDeg, MAX_TILT_CORRECTION_DEG);
  return [
    { perspective: PERSPECTIVE_DEPTH },
    { rotateX: `${rx}deg` },
    { rotateY: `${ry}deg` },
  ];
}
