// Persisted camera tool prefs (mute shutter, mirror selfie, animation,
// quality, resolution tier, countdown, capture mode).
//
// Lives in its own MMKV key — independent of UserPrefs and the map
// theme pref — so the camera screen can read/write without dragging unrelated
// preference shapes into its render path. Defensive against corrupted JSON:
// any missing or malformed field falls back to its default value.
import { kvGet, kvSet } from '../storage/app-storage';
import { CAMERA_SETTINGS_STORAGE_KEY } from '../storage/keys';
import { Logger } from '../../utils/logger';
import { isObject, safeJsonParse } from '../../utils/safe-json';
import type { OverlayMode } from '../../../components/pilgrimage/camera/types';
import type { EdgeIntensity } from './edge-overlay';
import type { SubjectFocus } from './subject-overlay';

// The storage key carries a `:v4` suffix: v4 reshaped the settings around
// VisionCamera's capture model — `skipProcessing` is gone (VisionCamera has no
// equivalent), and `quality` now maps to a QualityPrioritization
// (speed/balanced/quality) plus a numeric weight passed to the photo output.
export { CAMERA_SETTINGS_STORAGE_KEY };

// User-facing capture modes. 'hdr' was retired when we replaced the fake
// usePseudoHDR with a real exposure bracket + scene-aware 'auto' mode. Persisted
// 'hdr' values migrate to 'auto' in `pickValidSettings` so users who saved
// 'hdr' under v4 don't get reset to default.
export type CaptureMode = 'single' | 'burst' | 'auto';
export type CountdownSeconds = 0 | 3 | 5 | 10;
export type PictureQuality = 'standard' | 'high' | 'max';
export type ResolutionTier = '4k' | '2k';

export const CAPTURE_MODES: readonly CaptureMode[] = ['single', 'burst', 'auto'] as const;
export const COUNTDOWN_SECONDS: readonly CountdownSeconds[] = [0, 3, 5, 10] as const;
export const RESOLUTION_TIERS: readonly ResolutionTier[] = ['4k', '2k'] as const;

export const SILENT_SHUTTER_HELP_TEXT =
  'Mute where supported. iOS may still force shutter sound, especially in Japan/Korea or on devices that disallow suppression.';

/**
 * EV stops used for the real exposure bracket. Pass through
 * `clampBracketEvStops` against the device's reported bias range before
 * driving the SharedValue, because some devices report a tighter range than
 * ±2 EV (older sensors, telephoto on some Android devices).
 */
export const BRACKET_EV_STOPS: readonly [number, number, number] = [-2, 0, 2];

/**
 * Clamp a 3-stop bracket to the device's `minExposureBias..maxExposureBias`
 * range. Pure function — does not allocate when the input is already in range
 * but always returns a fresh tuple (mutation-safe for callers).
 */
export function clampBracketEvStops(
  stops: readonly [number, number, number],
  min: number,
  max: number
): [number, number, number] {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return [
    Math.max(lo, Math.min(hi, stops[0])),
    Math.max(lo, Math.min(hi, stops[1])),
    Math.max(lo, Math.min(hi, stops[2])),
  ];
}

export interface CameraSettings {
  mute: boolean;
  mirror: boolean;
  animateShutter: boolean;
  quality: PictureQuality;
  /**
   * User-facing capture resolution. Drives VisionCamera's `targetResolution`
   * (4k → UHD_*, 2k → QHD_*) — the actual format is negotiated by the
   * CameraSession against device capabilities.
   */
  resolutionTier: ResolutionTier;
  countdownSeconds: CountdownSeconds;
  captureMode: CaptureMode;
  /**
   * When true, the camera screen arms an auto-capture watcher that fires the
   * shutter once alignment is sustained above the threshold. Orthogonal to
   * `captureMode` — the active mode (single/burst/auto) still applies — and
   * stacks with `countdownSeconds`.
   */
  autoCapture: boolean;
  /**
   * Persisted overlay mode (anime / edge / sketch / subject). Restored on the
   * next camera launch so the user's pick survives across sessions. The hud
   * reducer keeps its own copy (`useCameraHud.overlayMode`) which gets seeded
   * from this value on mount and mirrors back on every change.
   */
  overlayMode: OverlayMode;
  /**
   * Edge-overlay intensity preset (low / mid / high). Persists alongside
   * `overlayMode` so users who tuned a specific edge style don't have to
   * re-pick it.
   */
  edgeIntensity: EdgeIntensity;
  /**
   * Subject-overlay focus radius preset (tight / normal / wide). Same
   * persistence rationale as `edgeIntensity`.
   */
  subjectFocus: SubjectFocus;
  /**
   * Subject-overlay combine toggle (overlap-and-blend vs replace).
   */
  subjectCombine: boolean;
}

export const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  // Silent by default — pilgrimage shooting is mostly in cafés, stations,
  // shrines, etc. where a loud shutter is socially loud. The OS may still
  // force the sound (e.g. in JP iOS), but defaulting to muted matches user
  // expectation. Users who saved an explicit `mute: false` keep their value
  // through `pickValidSettings`; only first-launch and fresh installs flip.
  mute: true,
  mirror: false,
  animateShutter: true,
  quality: 'high',
  resolutionTier: '4k',
  countdownSeconds: 0,
  captureMode: 'single',
  autoCapture: false,
  // Default to 'edge' — the anime bitmap fully covers the live preview at
  // typical overlay opacities, which surprises first-time users. Edge sketch
  // shows both reference geometry and the live scene at the same alpha.
  overlayMode: 'edge',
  edgeIntensity: 'low',
  subjectFocus: 'normal',
  subjectCombine: false,
};

/**
 * Numeric JPEG quality (0..1) passed to VisionCamera's `usePhotoOutput`. Used
 * when the underlying photo container is JPEG/HEIC — RAW formats ignore this.
 */
export function qualityToNumber(q: PictureQuality): number {
  switch (q) {
    case 'standard':
      return 0.7;
    case 'high':
      return 0.92;
    case 'max':
      return 1.0;
  }
}

/**
 * Maps the user-facing quality choice to VisionCamera's QualityPrioritization
 * — the higher-level knob the photo pipeline uses to decide between speed
 * (zero-shutter-lag bias) and quality (more processing time per shot).
 */
export function qualityToPrioritization(q: PictureQuality): 'speed' | 'balanced' | 'quality' {
  switch (q) {
    case 'standard':
      return 'speed';
    case 'high':
      return 'balanced';
    case 'max':
      return 'quality';
  }
}

function isCaptureMode(value: unknown): value is CaptureMode {
  return value === 'single' || value === 'burst' || value === 'auto';
}

function isCountdownSeconds(value: unknown): value is CountdownSeconds {
  return value === 0 || value === 3 || value === 5 || value === 10;
}

function isPictureQuality(value: unknown): value is PictureQuality {
  return value === 'standard' || value === 'high' || value === 'max';
}

function isResolutionTier(value: unknown): value is ResolutionTier {
  return value === '4k' || value === '2k';
}

function isOverlayMode(value: unknown): value is OverlayMode {
  return value === 'anime' || value === 'edge' || value === 'sketch' || value === 'subject';
}

function isEdgeIntensity(value: unknown): value is EdgeIntensity {
  return value === 'low' || value === 'mid' || value === 'high';
}

function isSubjectFocus(value: unknown): value is SubjectFocus {
  return value === 'tight' || value === 'normal' || value === 'wide';
}

function pickValidSettings(value: Record<string, unknown>): Partial<CameraSettings> {
  const out: Partial<CameraSettings> = {};
  if (typeof value.mute === 'boolean') out.mute = value.mute;
  if (typeof value.mirror === 'boolean') out.mirror = value.mirror;
  if (typeof value.animateShutter === 'boolean') out.animateShutter = value.animateShutter;
  if (isPictureQuality(value.quality)) out.quality = value.quality;
  if (isResolutionTier(value.resolutionTier)) out.resolutionTier = value.resolutionTier;
  if (isCountdownSeconds(value.countdownSeconds)) {
    out.countdownSeconds = value.countdownSeconds;
  }
  if (isCaptureMode(value.captureMode)) {
    out.captureMode = value.captureMode;
  } else if (value.captureMode === 'hdr') {
    // v4 migration: the retired 'hdr' user-facing mode maps to the new 'auto'
    // mode (which routes to native HDR when the device supports it, else to
    // the real exposure bracket). Done in-place so the next save rewrites the
    // stored value and existing users keep their HDR-leaning preference.
    out.captureMode = 'auto';
  }
  if (typeof value.autoCapture === 'boolean') out.autoCapture = value.autoCapture;
  if (isOverlayMode(value.overlayMode)) out.overlayMode = value.overlayMode;
  if (isEdgeIntensity(value.edgeIntensity)) out.edgeIntensity = value.edgeIntensity;
  if (isSubjectFocus(value.subjectFocus)) out.subjectFocus = value.subjectFocus;
  if (typeof value.subjectCombine === 'boolean') out.subjectCombine = value.subjectCombine;
  return out;
}

/** Synchronous read — safe to seed `useState` with on the camera launch path. */
export function loadCameraSettingsSync(): CameraSettings {
  try {
    const parsed = safeJsonParse(kvGet(CAMERA_SETTINGS_STORAGE_KEY), isObject);
    if (!parsed) return { ...DEFAULT_CAMERA_SETTINGS };
    return { ...DEFAULT_CAMERA_SETTINGS, ...pickValidSettings(parsed) };
  } catch (err) {
    Logger.warn('[CameraSettings] load failed, using defaults', err);
    return { ...DEFAULT_CAMERA_SETTINGS };
  }
}

/** Async read kept for callers that want a `Promise` signature. */
export async function loadCameraSettings(): Promise<CameraSettings> {
  return loadCameraSettingsSync();
}

export async function saveCameraSettings(settings: CameraSettings): Promise<void> {
  try {
    kvSet(CAMERA_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    Logger.warn('[CameraSettings] save failed', err);
  }
}
