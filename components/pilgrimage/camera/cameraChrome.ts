/**
 * Shared visual language for the camera capture chrome.
 *
 * Every control that floats over the live camera preview — top-bar buttons,
 * Row-2 chips, the overlay controls, the shutter row, the exposure slider —
 * reads its surface colours and sizing from here, so the whole HUD reads as
 * one cohesive, flat, translucent set instead of a pile of independently
 * styled buttons.
 *
 * The rgba / #fff values are drawn directly over the live camera preview, not
 * over a theme surface, so they are exempt from the "no hardcoded hex" rule
 * (CLAUDE.md camera-scrim exception). Accent / status colours still come from
 * `useTheme()` at the call site — only these neutral scrims live here.
 */
export const CameraChrome = {
  /** Idle translucent fill for a control — the scene shows through, lightly. */
  controlFill: 'rgba(0,0,0,0.4)',
  /** A denser fill for grouped controls (segmented bar, slider pill). */
  groupFill: 'rgba(0,0,0,0.46)',
  /** Pressed-state fill — a touch darker than idle. */
  pressedFill: 'rgba(0,0,0,0.58)',
  /** Faint hairline border — a soft edge, never a hard outline. */
  border: 'rgba(255,255,255,0.11)',
  /** A slightly stronger border for an active / focused affordance. */
  borderStrong: 'rgba(255,255,255,0.22)',
  /** Universal foreground over the dark scrim. */
  fg: '#fff',
  /** Muted foreground — secondary labels, inactive icons. */
  fgMuted: 'rgba(255,255,255,0.58)',
  /** Maximum-track / inactive-rail tint for sliders. */
  trackInactive: 'rgba(255,255,255,0.2)',

  /** Flat compact control height — Row-2 chips, the opacity pill. */
  controlHeight: 36,
  /** Primary control height — the overlay mode segmented bar. */
  groupHeight: 42,
  /** Secondary control height — contextual sub-row pills. */
  subControlHeight: 30,
  /** Corner radius for a standalone pill / chip. */
  pillRadius: 18,
  /** Corner radius for a grouped container (segmented bar, slider pill). */
  groupRadius: 20,
  /** Round capture-row buttons (library, flip). Meets 44px min touch target. */
  circleSize: 44,
  /** Default control icon size. */
  iconSize: 18,
} as const;

/** Soft drop shadow so a floating control lifts cleanly off the live scene. */
export const cameraControlShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.18,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 3,
} as const;
