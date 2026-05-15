// Persisted camera tool prefs (mute shutter, mirror selfie, animation,
// quality, picture size, countdown, capture mode).
//
// Lives in its own AsyncStorage key — independent of UserPrefs and the map
// theme pref — so the camera screen can read/write without dragging unrelated
// preference shapes into its render path. Defensive against corrupted JSON:
// any missing or malformed field falls back to its default value.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Logger } from '../../utils/logger';
import { isObject, safeJsonParse } from '../../utils/safe-json';

// v3 adds `skipProcessing` — bumped so legacy payloads fall through to
// DEFAULT_CAMERA_SETTINGS rather than silently coexisting with the new shape.
export const CAMERA_SETTINGS_STORAGE_KEY = 'aniseekr:camera-settings:v3';

export type CaptureMode = 'single' | 'burst' | 'hdr';
export type CountdownSeconds = 0 | 3 | 5 | 10;
export type PictureQuality = 'standard' | 'high' | 'max';

export const CAPTURE_MODES: readonly CaptureMode[] = ['single', 'burst', 'hdr'] as const;
export const COUNTDOWN_SECONDS: readonly CountdownSeconds[] = [0, 3, 5, 10] as const;
export const PICTURE_QUALITIES: readonly PictureQuality[] = [
  'standard',
  'high',
  'max',
] as const;

export interface CameraSettings {
  mute: boolean;
  mirror: boolean;
  animateShutter: boolean;
  quality: PictureQuality;
  pictureSize: string | null;
  countdownSeconds: CountdownSeconds;
  captureMode: CaptureMode;
  /**
   * When true, the camera screen arms an auto-capture watcher that fires the
   * shutter once alignment is sustained above the threshold. Orthogonal to
   * `captureMode` — the active mode (single/burst/hdr) still applies — and
   * stacks with `countdownSeconds`.
   */
  autoCapture: boolean;
  /**
   * When true, expo-camera's `takePictureAsync` is invoked with
   * `skipProcessing: true` — faster capture at the cost of orientation
   * fix-ups (some devices return rotated EXIF/raw bytes). Threaded into all
   * three capture paths (single, burst, HDR).
   */
  skipProcessing: boolean;
}

export const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  mute: false,
  mirror: false,
  animateShutter: true,
  quality: 'high',
  pictureSize: null,
  countdownSeconds: 0,
  captureMode: 'single',
  autoCapture: false,
  skipProcessing: false,
};

/**
 * Maps the symbolic quality choice to the numeric value expo-camera's
 * `takePictureAsync({ quality })` expects (0..1). 'high' is the default —
 * matches expo-camera's default behaviour but expressed explicitly.
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

function isCaptureMode(value: unknown): value is CaptureMode {
  return value === 'single' || value === 'burst' || value === 'hdr';
}

function isCountdownSeconds(value: unknown): value is CountdownSeconds {
  return value === 0 || value === 3 || value === 5 || value === 10;
}

function isPictureQuality(value: unknown): value is PictureQuality {
  return value === 'standard' || value === 'high' || value === 'max';
}

function pickValidSettings(value: Record<string, unknown>): Partial<CameraSettings> {
  const out: Partial<CameraSettings> = {};
  if (typeof value.mute === 'boolean') out.mute = value.mute;
  if (typeof value.mirror === 'boolean') out.mirror = value.mirror;
  if (typeof value.animateShutter === 'boolean') out.animateShutter = value.animateShutter;
  if (isPictureQuality(value.quality)) out.quality = value.quality;
  if (value.pictureSize === null || typeof value.pictureSize === 'string') {
    out.pictureSize = value.pictureSize;
  }
  if (isCountdownSeconds(value.countdownSeconds)) {
    out.countdownSeconds = value.countdownSeconds;
  }
  if (isCaptureMode(value.captureMode)) out.captureMode = value.captureMode;
  if (typeof value.autoCapture === 'boolean') out.autoCapture = value.autoCapture;
  if (typeof value.skipProcessing === 'boolean') out.skipProcessing = value.skipProcessing;
  return out;
}

export async function loadCameraSettings(): Promise<CameraSettings> {
  try {
    const raw = await AsyncStorage.getItem(CAMERA_SETTINGS_STORAGE_KEY);
    const parsed = safeJsonParse(raw, isObject);
    if (!parsed) return { ...DEFAULT_CAMERA_SETTINGS };
    return { ...DEFAULT_CAMERA_SETTINGS, ...pickValidSettings(parsed) };
  } catch (err) {
    Logger.warn('[CameraSettings] load failed, using defaults', err);
    return { ...DEFAULT_CAMERA_SETTINGS };
  }
}

export async function saveCameraSettings(settings: CameraSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(CAMERA_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    Logger.warn('[CameraSettings] save failed', err);
  }
}
