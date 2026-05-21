// Dual-space dial math: continuous (free-drag, snap-to-detent) vs island
// (tap-only, session-switching). Worklet-safe — every function below carries
// the 'worklet' directive so it can be called from reanimated UI-thread
// callbacks (pan gesture onUpdate, useAnimatedReaction) as well as from
// regular JS (effects, taps).
//
// Continuous space is the part of the dial that maps 1:1 to the active
// device's [minZoom, maxZoom]. Drag = free zoom; release = snap to nearest
// detent. Going below `continuousMinZoom` is impossible without swapping
// camera sessions, so we model the lower edge as an **escapement wall**:
// further pull just adds rubber-band damping, the position never crosses.
//
// Island space is the single off-strip detent on the far left (or far right
// when active=uw) that, when tapped, requests a session swap to a different
// physical lens. There is a visible gap between the island chip and the
// continuous strip so the user can SEE that crossing requires a different
// gesture.
//
// Why two spaces instead of one continuous strip from 0.5 to max:
//   * On a Pixel 8 wide-active session, dragging to 0.5 is physically
//     impossible — CameraX clamps to the active device's minZoom (0.67).
//     A continuous strip would either silently snap back (confusing) or
//     trigger an invisible session swap mid-drag (jarring camera flash).
//   * Tap-island-to-swap is honest: the user EXPECTS a brief transition
//     because they performed a discrete action.
//   * Mirrors iOS's native "0.5 island" affordance on iPhone 11+ in
//     vertical orientation.
//
// Rule 8 (no fake data): the island chip is only ever surfaced when the
// cohort layer has confirmed the target hardware exists. No island is ever
// invented from a hash or guess.

import type { FocalStop } from '../../../components/pilgrimage/camera/types';
import {
  buildDetents,
  type Detent,
  type StopZoomMap,
  SEGMENT_PX,
  SNAP_TOLERANCE_PX,
} from './zoom-dial';
import type { CohortStrategy } from './device-cohort';

/** Diameter of the island chip in pixels. Matches iOS's native 0.5 chip and
 *  comfortably exceeds the 44pt minimum tap target. */
export const ISLAND_CHIP_PX = 44;

/** Visible gap between island chip and continuous strip start. Large enough
 *  to read as a separate UI element, narrow enough to keep the dial
 *  horizontally compact. */
export const ISLAND_GAP_PX = 38;

/** Damping factor applied when the user drags past the escapement wall.
 *  Matches iOS scroll-view bounce feel; tightens motion enough that the
 *  user gets a clear "stop" signal without complete freeze. */
export const RUBBER_BAND_FACTOR = 0.18;

export type ActiveLens = 'wide' | 'ultra-wide';

export interface IslandChip {
  /** The focal stop the chip is labelled with (0.5 when active=wide; 1 when
   *  active=ultra-wide). */
  readonly stop: FocalStop;
  /** The lens the camera session should swap to when the chip is tapped. */
  readonly targetLens: ActiveLens;
  /** Centre of the chip in dial-strip pixel coordinates. For wide-active
   *  the chip sits left of the continuous strip at px ≈ ISLAND_CHIP_PX / 2. */
  readonly px: number;
}

export interface DialLayout {
  /** The lens currently providing preview. Determines the continuous range. */
  readonly activeLens: ActiveLens;
  /** Lower bound of the continuous strip in real zoom factor units. */
  readonly continuousMinZoom: number;
  /** Upper bound of the continuous strip in real zoom factor units. */
  readonly continuousMaxZoom: number;
  /** Pixel offset where the continuous strip starts in dial coordinates.
   *  0 when no island is present; ISLAND_CHIP_PX + ISLAND_GAP_PX when an
   *  island is rendered on the left. */
  readonly continuousStartPx: number;
  /** Detents that fall inside the continuous range, in dial coordinates
   *  (offset by `continuousStartPx`). */
  readonly continuousDetents: Detent[];
  /** Optional island chip; null when the cohort is logical or wide-only. */
  readonly islandChip: IslandChip | null;
  /** Total horizontal span of the dial in pixels. */
  readonly totalSpanPx: number;
}

interface BuildDialLayoutArgs {
  activeLens: ActiveLens;
  strategy: CohortStrategy;
  hasStandaloneUltraWide: boolean;
  continuousStops: readonly FocalStop[];
  stopZoom: StopZoomMap;
  activeMinZoom: number;
  activeMaxZoom: number;
  segPx?: number;
}

/**
 * Compose the full dial layout from cohort + active-lens state.
 *
 * `logical` cohort: no island, continuous covers the whole zoom range.
 * `standalone-switch` cohort: island chip on the left holding the target
 * lens's stop (0.5 when active=wide; 1 when active=ultra-wide). Continuous
 * strip starts after the chip + gap.
 * `wide-only` cohort: no island.
 */
export function buildDialLayout(args: BuildDialLayoutArgs): DialLayout {
  const segPx = args.segPx ?? SEGMENT_PX;
  const hasIsland =
    args.strategy === 'standalone-switch' && args.hasStandaloneUltraWide === true;
  const continuousStartPx = hasIsland ? ISLAND_CHIP_PX + ISLAND_GAP_PX : 0;

  const baseDetents = buildDetents(args.continuousStops, args.stopZoom, segPx);
  const continuousDetents: Detent[] = baseDetents.map((d) => ({
    stop: d.stop,
    zoom: d.zoom,
    px: d.px + continuousStartPx,
  }));

  const islandChip: IslandChip | null = hasIsland
    ? {
        stop: args.activeLens === 'wide' ? 0.5 : 1,
        targetLens: args.activeLens === 'wide' ? 'ultra-wide' : 'wide',
        px: ISLAND_CHIP_PX / 2,
      }
    : null;

  const lastContinuousPx =
    continuousDetents.length > 0
      ? continuousDetents[continuousDetents.length - 1].px + segPx
      : continuousStartPx;

  return {
    activeLens: args.activeLens,
    continuousMinZoom: args.activeMinZoom,
    continuousMaxZoom: args.activeMaxZoom,
    continuousStartPx,
    continuousDetents,
    islandChip,
    totalSpanPx: lastContinuousPx,
  };
}

/**
 * Snap a zoom value to the continuous range, treating attempts to cross
 * the lower edge as escapement (clamp to minZoom). This is what the dial
 * does when the gesture handler sees a drag that would otherwise produce
 * a sub-minZoom value: the dial position freezes at the wall.
 */
export function clampToContinuous(zoom: number, layout: DialLayout): number {
  'worklet';
  if (zoom !== zoom) return layout.continuousMinZoom; // NaN guard (worklet-safe; no Number.isNaN)
  if (zoom < layout.continuousMinZoom) return layout.continuousMinZoom;
  if (zoom > layout.continuousMaxZoom) return layout.continuousMaxZoom;
  return zoom;
}

/**
 * Damped pixel offset for an overscroll attempt — multiplies the raw
 * translation by RUBBER_BAND_FACTOR so the user feels resistance instead
 * of free motion when the gesture wants to cross the escapement wall.
 */
export function rubberBandResistance(
  overflowPx: number,
  // Default literal: worklet default params can't reference module-level
  // consts (Reanimated plugin captures body identifiers only). RUBBER_BAND_FACTOR
  // stays exported above for JS-side callers; this default mirrors its value.
  factor: number = 0.18
): number {
  'worklet';
  if (!Number.isFinite(overflowPx)) return 0;
  return overflowPx * factor;
}

/**
 * Returns true when a touch at `px` falls within the tap-target radius of
 * the island chip. Used by the dial's tap gesture to route a tap on the
 * island to a session-switch request rather than a normal detent snap.
 */
export function isIslandTap(
  touchPx: number,
  layout: DialLayout,
  // Default literal: see comment on rubberBandResistance — worklet defaults
  // can't reach module consts. Mirrors SNAP_TOLERANCE_PX from zoom-dial.ts.
  tolerancePx: number = 22
): boolean {
  'worklet';
  if (!layout.islandChip) return false;
  return Math.abs(touchPx - layout.islandChip.px) <= tolerancePx;
}
