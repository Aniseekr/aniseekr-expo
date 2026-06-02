// Pure histogram + hysteresis math for the auto-mode scene analyzer.
//
// The worklet wrapper lives in `hooks/useSceneAnalyzer.ts` — keeping the math
// in plain TypeScript means we can unit-test edge cases (all-dark, all-bright,
// mixed deep shadow + clipped highlight) without booting a worklet runtime.
//
// Rule 8: nothing here invents data. It only counts pixels that the caller
// already sampled from a real camera frame.

/** Luma threshold for "shadow clipped" pixels (0..255). */
export const SCENE_SHADOW_CLIP_THRESHOLD = 13;
/** Luma threshold for "highlight clipped" pixels (0..255). */
export const SCENE_HIGHLIGHT_CLIP_THRESHOLD = 242;
/** Fraction of pixels in shadow clip that flags the scene as high-DR. */
const SCENE_SHADOW_CLIP_RATIO = 0.08;
/** Fraction of pixels in highlight clip that flags the scene as high-DR. */
const SCENE_HIGHLIGHT_CLIP_RATIO = 0.05;
/** How many consecutive same-direction frames before we flip the recommendation. */
export const SCENE_HYSTERESIS_COUNT = 3;

export interface LumaHistogramResult {
  /** Fraction of pixels at-or-below the shadow threshold (0..1). */
  shadowClip: number;
  /** Fraction of pixels at-or-above the highlight threshold (0..1). */
  highlightClip: number;
  /** True when both clip ratios exceed the configured thresholds. */
  needsHdr: boolean;
}

/**
 * Count shadow- and highlight-clipped pixels in a downsampled luma buffer.
 * `luma` is interpreted as 8-bit values 0..255 (we accept `Uint8Array` for
 * memory, but `Uint8ClampedArray` and `number[]` work too — they all have
 * `.length` and numeric indexing). When the buffer is empty, both ratios are
 * `0` and `needsHdr` is `false` (no scene = nothing to recommend).
 */
export function analyzeLumaHistogram(luma: ArrayLike<number>): LumaHistogramResult {
  const total = luma.length;
  if (total === 0) {
    return { shadowClip: 0, highlightClip: 0, needsHdr: false };
  }
  let shadow = 0;
  let highlight = 0;
  for (let i = 0; i < total; i++) {
    const y = luma[i];
    if (y < SCENE_SHADOW_CLIP_THRESHOLD) shadow++;
    else if (y > SCENE_HIGHLIGHT_CLIP_THRESHOLD) highlight++;
  }
  const shadowClip = shadow / total;
  const highlightClip = highlight / total;
  const needsHdr =
    shadowClip > SCENE_SHADOW_CLIP_RATIO && highlightClip > SCENE_HIGHLIGHT_CLIP_RATIO;
  return { shadowClip, highlightClip, needsHdr };
}

/**
 * Hysteresis state for the auto-mode scene recommendation. We only flip the
 * surfaced recommendation after `SCENE_HYSTERESIS_COUNT` consecutive frames
 * agree — otherwise rapid panning across a window would flicker the AUTO·HDR
 * chip every other frame.
 */
export interface HysteresisState {
  /** The recommendation currently surfaced to React. */
  current: boolean;
  /**
   * Streak of consecutive observations equal to {@link pendingDirection} —
   * `0` whenever the last observation matched `current` (no change pending).
   */
  agreeCount: number;
  /** The observation we're considering flipping to. */
  pendingDirection: boolean;
}

export function createHysteresisState(initial: boolean = false): HysteresisState {
  return { current: initial, agreeCount: 0, pendingDirection: initial };
}

export interface HysteresisAdvanceResult {
  /** Whether the surfaced recommendation flipped on this observation. */
  flipped: boolean;
  /** The recommendation that should be surfaced after this observation. */
  current: boolean;
}

/**
 * Feed one observation into the hysteresis state machine. Mutates `state` and
 * returns the post-advance view. Mutation is intentional — the worklet keeps
 * one persistent state object across frames and we want to avoid allocating a
 * fresh object 5x/sec on the UI thread.
 */
export function advanceHysteresis(
  state: HysteresisState,
  needsHdr: boolean
): HysteresisAdvanceResult {
  if (needsHdr === state.current) {
    // The observation matches what we're already surfacing — reset any pending
    // flip so a single contradiction doesn't slowly accumulate towards a flip.
    state.agreeCount = 0;
    state.pendingDirection = state.current;
    return { flipped: false, current: state.current };
  }
  if (needsHdr === state.pendingDirection) {
    state.agreeCount += 1;
  } else {
    state.pendingDirection = needsHdr;
    state.agreeCount = 1;
  }
  if (state.agreeCount >= SCENE_HYSTERESIS_COUNT) {
    state.current = needsHdr;
    state.agreeCount = 0;
    state.pendingDirection = state.current;
    return { flipped: true, current: state.current };
  }
  return { flipped: false, current: state.current };
}
