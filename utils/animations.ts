// Shared animation configurations matching Swift version's physics-based animations
import { Easing, EasingFunction } from 'react-native-reanimated';

/**
 * Spring animation configurations for physics-based interactions
 * Matches Swift version's React Spring parameters
 */
export const SpringConfigs = {
  // Bounce effect with snap-back
  BOUNCE_BACK: {
    damping: 15,
    stiffness: 180,
    mass: 0.8,
    overshootClamping: false,
  },

  // Smooth page transitions
  PAGE_TRANSITION: {
    damping: 15,
    stiffness: 150,
    mass: 0.8,
    overshootClamping: false,
  },

  // Card swipe physics
  SWIPE_PHYSICS: {
    damping: 15,
    stiffness: 180,
    mass: 0.8,
    overshootClamping: false,
  },

  // Quick press feedback
  PRESS_FEEDBACK: {
    damping: 15,
    stiffness: 300,
    mass: 0.5,
    overshootClamping: false,
  },

  // Card reveal bounce
  CARD_REVEAL: {
    damping: 12,
    stiffness: 200,
    mass: 0.6,
    overshootClamping: false,
  },
} as const;

/**
 * Timing configurations for different animation types
 */
export const TimingConfigs = {
  FAST: 200, // Quick transitions (press feedback)
  NORMAL: 400, // Standard animations
  SLOW: 600, // Card reveals, page mounts
  VERY_SLOW: 1000, // Complex animations
} as const;

/**
 * Swipe gesture thresholds
 */
export const SwipeThresholds = {
  THRESHOLD: 120, // Pixel distance to trigger action
  SNAP_DISTANCE: 300, // Distance to snap card off-screen
  ROTATION_FACTOR: 25, // Rotation per pixel of horizontal offset
} as const;

/**
 * Easing functions for different animation effects
 */
export const EasingPresets = {
  bounce: Easing.bezier(0.68, -0.6, 0.32, 1.6),
  smooth: Easing.bezier(0.25, 0.1, 0.25, 1),
  elastic: Easing.bezier(0.175, 0.885, 0.32, 1.275),
} as const;

/**
 * Card reveal sequence timing
 * Matches Swift's sequential card reveal with delay
 */
export const CardRevealTiming = {
  BASE_DELAY: 0,
  CARD_DELAY: 200, // Delay between each card
  FADE_IN_DURATION: 400, // Fade in duration
  BOUNCE_DURATION: 600, // Bounce effect duration
} as const;
