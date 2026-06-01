// Companion Phase 2 — character lighting helpers.
//
// `deriveCharacterTint` is the inverse of the share auto color match:
// instead of pulling the user shot toward the anime reference, we pull the
// character cutout toward the background palette so the layered character
// reads as part of the scene rather than a sticker. The "gentle" intensity
// lerps the per-channel gain toward identity so the look stays believable
// (full ratio quickly burns highlights on dark characters under a bright
// background).
//
// `getShadowEllipse` returns the foot-shadow ellipse in character-local
// coordinates so callers can plug it straight into a Skia path.

import {
  applyAutoColorMatrix,
  IDENTITY_COLOR_MATRIX,
  type RgbMean,
} from '../pilgrimage/share-filters';

export type CharacterRgbMean = { avgR: number; avgG: number; avgB: number };

export const IDENTITY_CHARACTER_TINT = IDENTITY_COLOR_MATRIX.slice();

const DEFAULT_TINT_INTENSITY = 0.45;

function lerpMatrix(target: number[], t: number): number[] {
  if (t <= 0) return IDENTITY_COLOR_MATRIX.slice();
  if (t >= 1) return target.slice();
  const out = new Array<number>(20);
  for (let i = 0; i < 20; i++) {
    out[i] = IDENTITY_COLOR_MATRIX[i] + (target[i] - IDENTITY_COLOR_MATRIX[i]) * t;
  }
  return out;
}

/**
 * Build a tame ColorMatrix that nudges the character toward the background
 * lighting. `intensity` (0–1, default 0.45) controls how strongly we apply
 * the per-channel gain — full strength tends to overshoot, so the default
 * stays under half-way between identity and the raw match.
 */
export function deriveCharacterTint(
  bg: CharacterRgbMean | null | undefined,
  character: CharacterRgbMean | null | undefined,
  intensity: number = DEFAULT_TINT_INTENSITY
): number[] {
  if (!bg || !character) return IDENTITY_CHARACTER_TINT.slice();
  const bgMean: RgbMean = { r: bg.avgR, g: bg.avgG, b: bg.avgB };
  const charMean: RgbMean = { r: character.avgR, g: character.avgG, b: character.avgB };
  const full = applyAutoColorMatrix(bgMean, charMean);
  return lerpMatrix(full, intensity);
}

// ----- foot shadow -----

export type ShadowDescriptor = {
  /** 0–1 — alpha multiplier on the ellipse. */
  intensity: number;
  /** 0–1 — fraction of character height applied as blur radius. */
  softness: number;
  /** Vertical offset of the shadow centre from the character's vertical centre, in fractions of height (0.5 = bottom). */
  offsetY: number;
  /** Horizontal width fraction of the ellipse relative to the character width. */
  widthFraction: number;
  /** Aspect of the ellipse (rx/ry). Higher = flatter shadow. */
  aspect: number;
};

export const DEFAULT_SHADOW: ShadowDescriptor = {
  intensity: 0.45,
  softness: 0.06,
  offsetY: 0.5, // bottom edge
  widthFraction: 0.55,
  aspect: 4.5,
};

export function getShadowEllipse(
  charW: number,
  charH: number,
  shadow: ShadowDescriptor = DEFAULT_SHADOW
): { cx: number; cy: number; rx: number; ry: number; blur: number; alpha: number } {
  const cx = charW / 2;
  const cy = charH / 2 + charH * shadow.offsetY;
  const rx = (charW * shadow.widthFraction) / 2;
  const ry = rx / shadow.aspect;
  const blur = Math.max(2, charH * shadow.softness);
  return { cx, cy, rx, ry, blur, alpha: shadow.intensity };
}
