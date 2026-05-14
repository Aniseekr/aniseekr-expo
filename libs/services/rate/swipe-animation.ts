// Physics + timing knobs for the rating-screen swipe deck. Owned in one place
// so PhotoCard, NativeAdCard, and SwipeDeck never drift apart on what counts
// as a commit or how long an outgoing card stays mounted.

/** Translation (px) the background cards interpolate against. */
export const STACK_REVEAL_DISTANCE = 300;

/**
 * Delay between gesture commit and SwipeDeck advancing the visual top.
 * Keep this at 0 for native-feeling rapid swipes: outgoing cards remain
 * mounted independently, so there is no need to wait for the fly-out spring.
 */
export const SWIPE_HANDOFF_DELAY_MS = 0;

/** Defer SQLite + tracking writes until after the handoff settles. */
export const SWIPE_PERSISTENCE_DELAY_MS = 350;

/**
 * Time the outgoing card stays mounted after commit. Must exceed the EXIT
 * spring's settle time so the fly-out is never cut short by a React unmount.
 */
export const OUTGOING_CARD_LIFETIME_MS = 600;

/** Drag distance past which a gesture commits as a swipe. */
export const SWIPE_COMMIT_THRESHOLD_PX = 120;

/** Velocity past which a fast flick commits even without crossing the px threshold. */
export const SWIPE_COMMIT_VELOCITY_PX_S = 800;

/**
 * Reset hysteresis: once a card crossed the commit threshold, it must come
 * back inside this band before it would count as "not committed" again.
 */
export const SWIPE_RESET_THRESHOLD_PX = 80;

/** Vertical gap (px) between consecutive cards in the stack. */
export const CARD_STACK_SPACING_PX = 10;

/** Per-slot scale step (each card behind shrinks by this fraction). */
export const CARD_SCALE_RATIO = 0.05;

/** Per-slot opacity step (each card behind fades by this fraction). */
export const CARD_OPACITY_STEP = 0.15;

export function getStackRevealTranslation(direction: 'left' | 'right'): number {
  return direction === 'right' ? STACK_REVEAL_DISTANCE : -STACK_REVEAL_DISTANCE;
}

export function runSwipeHandoff(
  direction: 'left' | 'right',
  onSwipe: (direction: 'left' | 'right') => void
): void {
  if (SWIPE_HANDOFF_DELAY_MS <= 0) {
    onSwipe(direction);
    return;
  }
  setTimeout(() => onSwipe(direction), SWIPE_HANDOFF_DELAY_MS);
}
