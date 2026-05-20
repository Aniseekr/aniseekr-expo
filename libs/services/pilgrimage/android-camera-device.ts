// JS-only Android device picker that bypasses VisionCamera's broken
// `getCameraDevice` scoring on CameraX.
//
// WHY: VisionCamera's `CameraInfo+deviceType.kt` returns `UNKNOWN` for every
// `PhysicalCameraInfoAdapter`, and `CameraInfo+zoomLensSwitchFactors.kt`
// returns an empty array (both known TODOs in upstream). The JS-side
// `getCameraDevice` (devices/getCameraDevice.ts:67) scores candidate devices
// by counting how many of their `physicalDevices[i].type` match the requested
// filter — so on Android every match returns -N (every physical child is
// `'unknown'` ∉ filter), and the algorithm reliably picks the *single*
// wide-angle device (score 0) over the multi-cam virtual device (score -3),
// stripping the ultra-wide reach we actually need.
//
// The fix is JS-only because the underlying CameraX values we want
// (`minZoom`, `isVirtualDevice`, child `focalLength`) ARE coming through
// correctly — only the `type` field is broken. So we re-score candidates
// using the real values and pick the device that genuinely has an
// ultra-wide-angle child.
//
// Per CLAUDE.md Rule 8 the picker NEVER invents a device that doesn't have
// real ultra-wide reach. If no candidate reports `minZoom < 1` (or the
// hardware genuinely lacks an ultra-wide lens), the picker returns `null`
// and the caller falls back to VisionCamera's stock `getCameraDevice` —
// which on a single-lens phone is the right answer.
import type { CameraDevice } from 'react-native-vision-camera';

// Reported `minZoom` from CameraX below this threshold is the canonical
// signal that the device exposes a physical ultra-wide lens. Digital crop
// can never zoom out below 1.0× so anything strictly less than 1 is
// hardware-derived. Empirical reports across vendors:
//   * iPhone Triple-Camera virtual device: 0.5
//   * Samsung Galaxy S20 FE / S22 / S23 / S24: 0.5
//   * Pixel 6/7/8 / 8 Pro: 0.67 (Pixel never lets sub-0.5 reach down)
//   * Xiaomi 12/13/14: 0.5–0.6
//   * Oppo Find X5/X6 / Vivo X90/X100: 0.5–0.6
// A threshold of `1.0` (strict <) catches all of those without false
// positives from sensor float noise (every modern phone reports exactly
// 1.0 or 0.0 for the main-lens minimum, never 0.99-ish).
const ULTRA_WIDE_MIN_ZOOM_EXCLUSIVE = 1.0;

// Smartphone ultra-wide-angle lenses sit at ≤ 3.5mm raw focal length
// (mainstream main-wide lenses are 4–8mm raw). Used as a secondary
// confidence boost on top of the minZoom signal — never as the sole
// criterion, because some OEMs (notably Xiaomi MIUI) under-report focal
// length on the ultra-wide as 0 while still exposing the lens via
// minZoom < 1.
const ULTRA_WIDE_FOCAL_LENGTH_MAX_MM = 3.5;

interface PickerCandidate {
  readonly device: CameraDevice;
  readonly hasSubOneMinZoom: boolean;
  readonly hasUltraWideFocalLength: boolean;
  readonly maxZoom: number;
}

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function buildCandidate(device: CameraDevice): PickerCandidate {
  const hasSubOneMinZoom =
    isPositiveFinite(device.minZoom) && device.minZoom < ULTRA_WIDE_MIN_ZOOM_EXCLUSIVE;

  let minChildFocal = Infinity;
  for (const child of device.physicalDevices) {
    if (isPositiveFinite(child.focalLength) && child.focalLength < minChildFocal) {
      minChildFocal = child.focalLength;
    }
  }
  const hasUltraWideFocalLength =
    minChildFocal !== Infinity && minChildFocal <= ULTRA_WIDE_FOCAL_LENGTH_MAX_MM;

  return {
    device,
    hasSubOneMinZoom,
    hasUltraWideFocalLength,
    maxZoom: isPositiveFinite(device.maxZoom) ? device.maxZoom : 0,
  };
}

/**
 * Returns the rear-facing VisionCamera device with the broadest verified
 * lens range (genuinely-reachable 0.5× ultra-wide reach + as much
 * telephoto reach as the device exposes), or `null` when no candidate
 * device reports a sub-1× minZoom.
 *
 * Selection priority (each tier short-circuits when populated):
 *   1. Virtual devices with a real ultra-wide signal:
 *      `isVirtualDevice && minZoom < 1 && minChildFocalLength ≤ 3.5mm`.
 *      Among ties prefer the one with the largest `maxZoom` (i.e. the
 *      one that also pulls in the telephoto sibling, giving the dial
 *      a real 3× pillar via `lens-switching.ts`'s focal-length fallback).
 *   2. Any device that reports `minZoom < 1` (Xiaomi/Oppo/Vivo whose
 *      ultra-wide child reports `focalLength = 0` still pass here).
 *      Same maxZoom tiebreak.
 *   3. `null` — the caller should fall through to VisionCamera's stock
 *      `getCameraDevice`. Returning `null` here is *correct* on a
 *      single-lens device (Pixel 6a etc.); the dial will then render
 *      only the 1× pillar, which is honest.
 *
 * Rule 8 (no fake data): the picker only returns a device whose
 * `minZoom < 1` is a real CameraX value. We never coerce a 1.0×
 * single-lens device into "looking like" an ultra-wide device.
 */
export function selectAndroidBackDevice(devices: readonly CameraDevice[]): CameraDevice | null {
  const candidates = devices
    .filter((d) => d.position === 'back')
    .map(buildCandidate);

  if (candidates.length === 0) return null;

  const tier1 = candidates.filter(
    (c) => c.device.isVirtualDevice && c.hasSubOneMinZoom && c.hasUltraWideFocalLength
  );
  if (tier1.length > 0) return pickBroadest(tier1).device;

  const tier2 = candidates.filter((c) => c.hasSubOneMinZoom);
  if (tier2.length > 0) return pickBroadest(tier2).device;

  return null;
}

function pickBroadest(candidates: readonly PickerCandidate[]): PickerCandidate {
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i += 1) {
    const c = candidates[i];
    if (c.maxZoom > best.maxZoom) {
      best = c;
    }
  }
  return best;
}
