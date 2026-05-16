// Pure, React-free math for the camera ZoomDial — a CD-style continuous zoom
// dial that replaces the old 4-button FocalPills row.
//
// WHY equal-pixel segments (not linear-in-raw-zoom):
// expo-camera's normalized `zoom` (0..1) maps EXPONENTIALLY to the real lens
// factor, so the labeled detents 1x/2x/3x land at STOP_TO_ZOOM ~ 0 / 0.177 /
// 0.281 — i.e. 2x and 3x are crammed into the first ~28% of the raw axis. A
// dial laid out linearly in raw zoom would bunch every label at the far left
// and leave 70% of the strip as an unlabeled void. Instead we give each gap
// between consecutive detents an EQUAL pixel width (`segPx`) and interpolate
// the zoom value linearly *within* each segment. The mapping stays monotonic
// and invertible, so position<->zoom round-trips exactly.
//
// Rule 8 (no fake data): the dial only ever LABELS the real detents
// (0.5/1/2/3x). Past the last detent we render one more equal-width segment of
// neutral, UNLABELED ticks — the app does not know the device's true max zoom
// factor, so it must never print an invented intermediate value like "4.2x".
import type { FocalStop } from '../../../components/pilgrimage/camera/types';

/** Normalized 0..1 zoom value each focal stop targets. Mirrors useCameraZoom's
 *  STOP_TO_ZOOM but kept here as the dial's input contract so this module has
 *  no React/hook dependency. The caller passes the live map in. */
export type StopZoomMap = Record<FocalStop, number>;

/** A labeled detent on the dial: a tap target AND a snap point. */
export interface Detent {
  /** The focal stop this detent represents (0.5 / 1 / 2 / 3). */
  stop: FocalStop;
  /** Pixel offset of this detent's tick, measured from the strip's left edge. */
  px: number;
  /**
   * Normalized 0..1 digital zoom value at this detent. Note: 0.5 has NO digital
   * zoom (it's a separate ultrawide LENS), so its zoom is always 0 — it is a
   * discrete tap/snap target only.
   */
  zoom: number;
}

/** Default detent set for a digital-only (no optical lens info) rear camera. */
export const DEFAULT_DETENT_STOPS: FocalStop[] = [1, 2, 3];
/** Front-facing cameras effectively expose a single 1x stop. */
export const FRONT_FACING_DETENT_STOPS: FocalStop[] = [1];

/** Equal pixel width of every segment between consecutive detents (and of the
 *  "beyond last detent" neutral tail). ~96px gives a comfortable drag throw. */
export const SEGMENT_PX = 96;
/** Spacing between neutral (unlabeled) ticks along the strip. */
export const TICK_SPACING_PX = 12;
/** How close (in px) the strip center must be to a detent for it to snap. */
export const SNAP_TOLERANCE_PX = 22;

// The px<->zoom math below is called from BOTH the JS thread (effects, taps,
// useMemo) and reanimated worklets (the pan gesture's onUpdate/onEnd, the
// useAnimatedReaction). Functions reached from a worklet MUST carry the
// 'worklet' directive or they throw on the UI thread — same reason
// useCameraZoom's `clamp` is marked. A 'worklet' function still runs fine on
// the JS thread, so marking them is safe for the JS-side callers too.
function clampNumber(v: number, lo: number, hi: number): number {
  'worklet';
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function lerp(a: number, b: number, t: number): number {
  'worklet';
  return a + (b - a) * t;
}

function isFiniteNumber(value: number): boolean {
  'worklet';
  return value === value && value !== Infinity && value !== -Infinity;
}

/**
 * Builds the ordered detent list for the dial. `stops` is the ascending list
 * of focal stops the device exposes (e.g. `[1,2,3]` digital-only, `[0.5,1,2,3]`
 * on an ultrawide-equipped device). Each detent gets an equal-pixel offset.
 *
 * - `stopZoom` supplies the normalized zoom value for 1/2/3x (0.5x is forced to
 *   0 — there is no digital zoom below 1x).
 * - The first detent sits at `px = 0`; each subsequent detent is `segPx` further
 *   right. The dial then appends one more `segPx`-wide neutral tail past the
 *   last detent.
 */
export function buildDetents(
  stops: readonly FocalStop[],
  stopZoom: StopZoomMap,
  segPx: number = SEGMENT_PX
): Detent[] {
  const sorted = [...new Set(stops)].sort((a, b) => a - b);
  return sorted.map((stop, index) => ({
    stop,
    px: index * segPx,
    // 0.5x is a discrete ultrawide lens — no continuous digital zoom there.
    zoom: stop === 0.5 ? 0 : clampNumber(stopZoom[stop] ?? 0, 0, 1),
  }));
}

/**
 * Total draggable pixel span of the strip: from the first detent (px 0) to the
 * end of the neutral tail one segment past the last detent.
 */
export function dialSpanPx(detents: readonly Detent[], segPx: number = SEGMENT_PX): number {
  'worklet';
  if (detents.length === 0) return 0;
  return detents[detents.length - 1].px + segPx;
}

/**
 * Gesture translation -> strip position.
 *
 * A leftward drag has a negative translationX, but it should move the strip
 * toward larger px / larger zoom values, so the translation is inverted.
 */
export function dragPositionForTranslation(
  startPx: number,
  translationX: number,
  spanPx: number
): number {
  'worklet';
  const safeStart = isFiniteNumber(startPx) ? startPx : 0;
  const safeTranslation = isFiniteNumber(translationX) ? translationX : 0;
  const safeSpan = isFiniteNumber(spanPx) ? Math.max(0, spanPx) : 0;
  return clampNumber(safeStart - safeTranslation, 0, safeSpan);
}

/**
 * position px -> normalized 0..1 zoom value.
 *
 * Within each detent-to-detent segment the zoom is interpolated linearly
 * between the two detents' zoom values. Past the last detent the tail runs
 * linearly from the last detent's zoom up to 1 (full zoom). Out-of-range px is
 * clamped to the strip span.
 */
export function zoomForPosition(
  px: number,
  detents: readonly Detent[],
  segPx: number = SEGMENT_PX
): number {
  'worklet';
  if (detents.length === 0) return 0;
  const span = dialSpanPx(detents, segPx);
  const clamped = clampNumber(px, 0, span);
  if (detents.length === 1) {
    // Single detent (e.g. front camera) — tail interpolates detent.zoom -> 1.
    const d = detents[0];
    const t = clampNumber((clamped - d.px) / segPx, 0, 1);
    return clampNumber(lerp(d.zoom, 1, t), 0, 1);
  }
  for (let i = 0; i < detents.length - 1; i += 1) {
    const a = detents[i];
    const b = detents[i + 1];
    if (clamped <= b.px) {
      const t = clampNumber((clamped - a.px) / (b.px - a.px), 0, 1);
      return clampNumber(lerp(a.zoom, b.zoom, t), 0, 1);
    }
  }
  // Beyond the last detent: neutral tail interpolating last.zoom -> 1.
  const last = detents[detents.length - 1];
  const t = clampNumber((clamped - last.px) / segPx, 0, 1);
  return clampNumber(lerp(last.zoom, 1, t), 0, 1);
}

/**
 * normalized 0..1 zoom value -> position px. Inverse of `zoomForPosition`;
 * round-trips exactly for any in-range zoom because every segment is a strictly
 * monotonic linear map. Out-of-range zoom is clamped to the strip span.
 */
export function positionForZoom(
  zoom: number,
  detents: readonly Detent[],
  segPx: number = SEGMENT_PX
): number {
  'worklet';
  if (detents.length === 0) return 0;
  const z = clampNumber(zoom, 0, 1);
  if (detents.length === 1) {
    const d = detents[0];
    if (z <= d.zoom) return d.px;
    const t = d.zoom >= 1 ? 1 : (z - d.zoom) / (1 - d.zoom);
    return d.px + clampNumber(t, 0, 1) * segPx;
  }
  for (let i = 0; i < detents.length - 1; i += 1) {
    const a = detents[i];
    const b = detents[i + 1];
    if (z <= b.zoom) {
      // Guard against a degenerate segment where two detents share a zoom
      // value (e.g. 0.5x and 1x both map to 0): snap to the segment start.
      if (b.zoom <= a.zoom) return a.px;
      const t = clampNumber((z - a.zoom) / (b.zoom - a.zoom), 0, 1);
      return a.px + t * (b.px - a.px);
    }
  }
  const last = detents[detents.length - 1];
  if (z <= last.zoom) return last.px;
  const t = last.zoom >= 1 ? 1 : (z - last.zoom) / (1 - last.zoom);
  return last.px + clampNumber(t, 0, 1) * segPx;
}

/**
 * Returns the focal stop of the detent nearest `px`, or `null` when the nearest
 * detent is further than `tolerancePx`. Used for snap-on-release and to decide
 * which detent label to highlight while dragging.
 */
export function nearestDetent(
  px: number,
  detents: readonly Detent[],
  tolerancePx: number = SNAP_TOLERANCE_PX
): FocalStop | null {
  'worklet';
  let best: FocalStop | null = null;
  let bestDelta = Infinity;
  for (const d of detents) {
    const delta = Math.abs(px - d.px);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = d.stop;
    }
  }
  if (best !== null && bestDelta <= tolerancePx) return best;
  return null;
}

/** Pixel offset of a detent by its focal stop, or `null` if not on the dial. */
export function positionForStop(stop: FocalStop, detents: readonly Detent[]): number | null {
  'worklet';
  const found = detents.find((d) => d.stop === stop);
  return found ? found.px : null;
}
