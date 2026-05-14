import { describe, expect, it } from 'bun:test';
import {
  CARD_OPACITY_STEP,
  CARD_SCALE_RATIO,
  CARD_STACK_SPACING_PX,
  OUTGOING_CARD_LIFETIME_MS,
  STACK_REVEAL_DISTANCE,
  SWIPE_COMMIT_THRESHOLD_PX,
  SWIPE_COMMIT_VELOCITY_PX_S,
  SWIPE_HANDOFF_DELAY_MS,
  SWIPE_PERSISTENCE_DELAY_MS,
  SWIPE_RESET_THRESHOLD_PX,
  getStackRevealTranslation,
  runSwipeHandoff,
} from '../../../libs/services/rate/swipe-animation';

describe('swipe animation', () => {
  it('promotes the next card instead of collapsing the stack during exit', () => {
    expect(STACK_REVEAL_DISTANCE).toBe(300);
  });

  it('uses the swipe direction when revealing the next card', () => {
    expect(getStackRevealTranslation('right')).toBe(STACK_REVEAL_DISTANCE);
    expect(getStackRevealTranslation('left')).toBe(-STACK_REVEAL_DISTANCE);
  });

  it('hands control to the next card before the exit animation finishes', () => {
    expect(SWIPE_HANDOFF_DELAY_MS).toBeLessThanOrEqual(16);
  });

  it('defers persistence until after the next card has received control', () => {
    expect(SWIPE_PERSISTENCE_DELAY_MS).toBeGreaterThan(SWIPE_HANDOFF_DELAY_MS);
  });

  it('does not add a timer layer when handoff delay is zero', () => {
    const directions: Array<'left' | 'right'> = [];
    runSwipeHandoff('right', (direction) => directions.push(direction));
    expect(directions).toEqual(['right']);
  });

  it('keeps the outgoing card alive past the visual handoff so the fly-out can finish', () => {
    // If the outgoing card unmounts before the handoff lands, the fly-out
    // animation gets cut off mid-air. Lifetime must clear handoff with margin.
    expect(OUTGOING_CARD_LIFETIME_MS).toBeGreaterThan(SWIPE_HANDOFF_DELAY_MS * 4);
  });

  it('keeps the commit reset threshold inside the commit threshold (hysteresis)', () => {
    expect(SWIPE_RESET_THRESHOLD_PX).toBeLessThan(SWIPE_COMMIT_THRESHOLD_PX);
  });

  it('exposes velocity commit threshold for fast flicks', () => {
    expect(SWIPE_COMMIT_VELOCITY_PX_S).toBeGreaterThan(0);
  });

  it('keeps stack spacing and scale ratios small enough that 3 visible cards stay legible', () => {
    expect(CARD_STACK_SPACING_PX).toBeGreaterThan(0);
    expect(CARD_STACK_SPACING_PX).toBeLessThan(40);
    expect(CARD_SCALE_RATIO).toBeGreaterThan(0);
    expect(CARD_SCALE_RATIO).toBeLessThan(0.2);
    expect(CARD_OPACITY_STEP).toBeGreaterThan(0);
    expect(CARD_OPACITY_STEP).toBeLessThan(0.5);
  });
});
