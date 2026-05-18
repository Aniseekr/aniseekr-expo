export interface CameraHeaderInput {
  sceneName?: string | string[] | null;
  animeTitle?: string | string[] | null;
  ep?: string | string[] | number | null;
}

export interface CameraHeaderText {
  title: string;
  subtitle: string;
}

export type CameraOrientationMode = 'auto' | 'landscape';
export type CameraOrientationLockIntent = 'unlock' | 'landscape';

export interface CameraActiveInput {
  appIsForeground: boolean;
  settingsOpen: boolean;
}

// Fixed camera chrome — solid black letterbox bars. Portrait pins a bar top +
// bottom; landscape turns it into a pillarbox (left rail + right rail). These
// content sizes EXCLUDE the safe-area inset / home-indicator pad; the screen
// adds `topInset` / `bottomPad(insets)` / side insets on top.
export const CAMERA_TOP_BAR_CONTENT_HEIGHT = 52;
export const CAMERA_BOTTOM_BAR_CONTENT_HEIGHT = 164;
// Landscape collapses the top-bar content into a LEFT rail of this width,
// mirroring the right shutter rail so the camera is framed left + right.
export const CAMERA_SIDE_RAIL_WIDTH = 100;

// Minimum bottom inset (px) the camera chrome assumes for the Android gesture
// navigation bar — the "海帶條" pill. Some Android edge-to-edge configurations
// report `useSafeAreaInsets().bottom` as 0 even though the gesture bar is drawn
// over the window; the raw inset would then let the shutter row sit underneath
// it. Flooring the camera's bottom inset at this value keeps the controls
// clear. Deliberately conservative: on a device with no navigation bar this
// only adds a little extra letterbox to an already-letterboxed screen.
export const ANDROID_GESTURE_NAV_MIN_INSET = 24;

// The "More" tool menu is a drill-down popover. Portrait: it drops down from
// the top bar. Landscape: it opens just inside the camera window, clear of the
// left rail. Exported (not component-local) so the anchor maths stay
// unit-testable.
export const CAMERA_TOOL_MENU_PANEL_GAP = 10;
export const CAMERA_TOOL_MENU_MIN_PANEL_WIDTH = 280;
export const CAMERA_TOOL_MENU_PANEL_WIDTH = 320;

export interface CameraToolMenuAnchorInput {
  topInset: number;
  isLandscape: boolean;
}

export interface CameraToolMenuAnchor {
  topOffset: number;
  // Exactly one of these is set: portrait hugs the right margin, landscape
  // hugs the left rail.
  leftOffset?: number;
  rightOffset?: number;
}

export interface CameraPlaceBadgeLayoutInput {
  topInset: number;
  leftInset: number;
  rightInset: number;
  rightRailWidth: number;
  isLandscape: boolean;
}

export interface CameraPlaceBadgeLayout {
  top: number;
  left: number;
  right: number;
}

export interface TransientCameraHudVisibilityInput {
  toolMenuOpen: boolean;
  afLocked: boolean;
}

export interface TransientCameraHudVisibility {
  showAutoCaptureBadge: boolean;
  showCaptureHistory: boolean;
  showFocusExposureBar: boolean;
}

const RESERVED_COMPARE_ROUTES = new Set(['align', 'preview', 'share', 'tips']);
const EV_MIN = -2;
const EV_MAX = 2;
const CAMERA_PLACE_BADGE_MARGIN = 12;
const CAMERA_PLACE_BADGE_PORTRAIT_GAP = 8;

export function formatCameraHeader(input: CameraHeaderInput): CameraHeaderText {
  const animeTitle = firstParam(input.animeTitle);
  const episode = formatEpisode(firstParam(input.ep));

  if (animeTitle && episode) {
    return { title: 'Scene Match', subtitle: `${animeTitle} · ${episode}` };
  }
  if (animeTitle) {
    return { title: 'Scene Match', subtitle: `${animeTitle} scene` };
  }
  if (episode) {
    return { title: 'Scene Match', subtitle: `${episode} · anime scene` };
  }
  return { title: 'Scene Match', subtitle: 'Anime reference' };
}

export function isCameraCapturePath(pathname: string | null | undefined): boolean {
  const clean = (pathname ?? '').split(/[?#]/)[0]?.replace(/\/+$/, '') ?? '';
  const parts = clean.split('/').filter(Boolean);
  if (parts.length !== 3) return false;
  if (parts[0] !== 'pilgrimage' || parts[1] !== 'compare') return false;
  return !RESERVED_COMPARE_ROUTES.has(parts[2] ?? '');
}

export function cameraOrientationLockIntent(
  mode: CameraOrientationMode
): CameraOrientationLockIntent {
  return mode === 'landscape' ? 'landscape' : 'unlock';
}

export function roundExposureValue(value: number): number {
  const clamped = Math.max(EV_MIN, Math.min(EV_MAX, value));
  return Number(clamped.toFixed(1));
}

export function resolveCameraToolMenuAnchor(
  input: CameraToolMenuAnchorInput
): CameraToolMenuAnchor {
  if (input.isLandscape) {
    // ⋯ lives in the left rail — the popover opens just inside the camera
    // window, clear of the rail, with the full window height to grow into.
    return {
      topOffset: input.topInset + CAMERA_TOOL_MENU_PANEL_GAP,
      leftOffset: CAMERA_SIDE_RAIL_WIDTH + CAMERA_TOOL_MENU_PANEL_GAP,
    };
  }
  // Portrait drops the popover straight down from the top bar.
  return {
    topOffset: input.topInset + CAMERA_TOP_BAR_CONTENT_HEIGHT + CAMERA_TOOL_MENU_PANEL_GAP,
    rightOffset: 16,
  };
}

export function resolveCameraPlaceBadgeLayout(
  input: CameraPlaceBadgeLayoutInput
): CameraPlaceBadgeLayout {
  if (input.isLandscape) {
    return {
      top: input.topInset + CAMERA_PLACE_BADGE_MARGIN,
      left: input.leftInset + CAMERA_SIDE_RAIL_WIDTH + CAMERA_PLACE_BADGE_MARGIN + 4,
      right: input.rightInset + input.rightRailWidth + CAMERA_PLACE_BADGE_MARGIN,
    };
  }

  return {
    top: input.topInset + CAMERA_TOP_BAR_CONTENT_HEIGHT + CAMERA_PLACE_BADGE_PORTRAIT_GAP,
    left: Math.max(16, input.leftInset + CAMERA_PLACE_BADGE_MARGIN),
    right: Math.max(16, input.rightInset + CAMERA_PLACE_BADGE_MARGIN),
  };
}

export function resolveTransientCameraHudVisibility(
  input: TransientCameraHudVisibilityInput
): TransientCameraHudVisibility {
  const showTransientHud = !input.toolMenuOpen;
  return {
    showAutoCaptureBadge: showTransientHud,
    showCaptureHistory: showTransientHud,
    showFocusExposureBar: input.afLocked && showTransientHud,
  };
}

export function resolveCameraActive(input: CameraActiveInput): boolean {
  return input.appIsForeground && !input.settingsOpen;
}

/**
 * Resolve the bottom safe-area inset the camera capture screen should pad for.
 *
 * iOS home-indicator insets are reliable, so the reported value is used as-is.
 * On Android the value is floored at {@link ANDROID_GESTURE_NAV_MIN_INSET} so a
 * mis-reported `0` (a known Android edge-to-edge quirk) can't let the system
 * navigation bar cover the shutter. A genuine, larger inset (e.g. the
 * three-button nav bar) is always kept.
 */
export function resolveCameraBottomInset(
  reportedBottomInset: number,
  platformOS: string
): number {
  const safe =
    Number.isFinite(reportedBottomInset) && reportedBottomInset > 0 ? reportedBottomInset : 0;
  if (platformOS === 'android') {
    return Math.max(safe, ANDROID_GESTURE_NAV_MIN_INSET);
  }
  return safe;
}

function firstParam(value: CameraHeaderInput['animeTitle'] | CameraHeaderInput['ep']): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === null || raw === undefined) return '';
  return String(raw).trim();
}

function formatEpisode(value: string): string {
  if (!value) return '';
  const normalized = value.replace(/^ep(?:isode)?\s*/i, '').trim();
  return normalized ? `EP ${normalized}` : '';
}
