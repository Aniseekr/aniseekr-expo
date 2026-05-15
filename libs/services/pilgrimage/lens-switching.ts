export type LensFocalStop = 0.5 | 1 | 2 | 3;
export type TelephotoStop = 2 | 3;

export const LENS_ULTRA_WIDE = 'builtInUltraWideCamera';
export const LENS_WIDE = 'builtInWideAngleCamera';
export const LENS_TELEPHOTO = 'builtInTelephotoCamera';

// Virtual / multi-lens "auto-switching" cameras exposed by AVFoundation on
// iPhone Pro hardware. Unlike the single-physical lenses above, these
// composite devices let iOS pick the best underlying lens for the current
// focal length and lighting — smoother optical zoom transitions, at the cost
// of fine-grained user control. We surface them as a single "AUTO" pill.
export const LENS_DUAL = 'builtInDualCamera';
export const LENS_DUAL_WIDE = 'builtInDualWideCamera';
export const LENS_TRIPLE = 'builtInTripleCamera';

// Ordered by preference: triple beats dual beats dual-wide. Picked so the
// device's most capable virtual stack is selected when multiple are reported.
const VIRTUAL_LENS_PRIORITY: readonly string[] = [
  LENS_TRIPLE,
  LENS_DUAL,
  LENS_DUAL_WIDE,
] as const;

export function isVirtualLens(lens: string | null | undefined): boolean {
  if (!lens) return false;
  return VIRTUAL_LENS_PRIORITY.includes(lens);
}

/**
 * Filters `available` down to the virtual auto-switching lenses iOS reports,
 * preserving the input order. Returns an empty array on devices without any.
 *
 * Rule 8: only echoes back lenses that were actually present in `available` —
 * we never seed phantom virtual lenses just because the device is "probably"
 * a Pro model.
 */
export function virtualLensesFromAvailable(available: string[]): string[] {
  return available.filter((lens) => VIRTUAL_LENS_PRIORITY.includes(lens));
}

/**
 * Picks the best virtual lens for AUTO mode given what the device actually
 * reports. Priority: triple > dual > dualWide. Returns null when no virtual
 * lens is exposed (most non-Pro phones, all Android) so callers can hide the
 * AUTO pill instead of selecting something that doesn't exist.
 */
export function pickAutoVirtualLens(available: string[]): string | null {
  for (const candidate of VIRTUAL_LENS_PRIORITY) {
    if (available.includes(candidate)) return candidate;
  }
  return null;
}

export function stopForLens(
  lens: string | null | undefined,
  telephotoStop: TelephotoStop = 3
): LensFocalStop | null {
  if (lens === LENS_ULTRA_WIDE) return 0.5;
  if (lens === LENS_WIDE) return 1;
  if (lens === LENS_TELEPHOTO) return telephotoStop;
  return null;
}

export function lensForFocalStop(
  stop: LensFocalStop,
  availableLenses: string[],
  telephotoStop: TelephotoStop = 3
): string | null {
  const lens = lensForStop(stop, telephotoStop);
  if (!lens) return null;
  return availableLenses.includes(lens) ? lens : null;
}

export function stopsForAvailableLenses(
  availableLenses: string[],
  telephotoStop: TelephotoStop = 3
): LensFocalStop[] {
  const stops = new Set<LensFocalStop>();
  for (const lens of availableLenses) {
    const stop = stopForLens(lens, telephotoStop);
    if (stop !== null) stops.add(stop);
  }
  return [...stops].sort((a, b) => a - b);
}

function lensForStop(stop: LensFocalStop, telephotoStop: TelephotoStop): string | null {
  if (stop === 0.5) return LENS_ULTRA_WIDE;
  if (stop === 1) return LENS_WIDE;
  if (stop === telephotoStop) return LENS_TELEPHOTO;
  return null;
}
