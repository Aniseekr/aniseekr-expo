// Derives the zoom-dial's focal-stop set from VisionCamera device info.
//
// On iOS every multi-lens device reports its real physical lenses
// (`physicalLensTypes`) AND the zoom factors at which a virtual multi-lens
// device auto-switches between them (`zoomLensSwitchFactors`). Both are real
// values straight from the OS — no Apple-only lens-name table, no native patch.
//
// On Android both fields are empty on every multi-camera device today because
// VisionCamera's CameraX adapter stubs them out to avoid Camera2 interop
// crashes (`CameraInfo+zoomLensSwitchFactors.kt` always returns an empty
// DoubleArray; `CameraInfo+deviceType.kt` returns UNKNOWN on every
// `PhysicalCameraInfoAdapter`, and per-child `focalLength` is null because
// `Camera2CameraInfo.fromSafe()` rejects the adapter — upstream tracking:
// https://issuetracker.google.com/issues/496096527). Without a fallback the
// dial would render only the neutral 1× pillar even on a Pixel 8 Pro or
// Samsung S24 Ultra.
//
// The fallback consumes the three real signals CameraX *does* give us:
//   * The virtual device's `minZoom` (from `zoomState.minZoomRatio`) — any
//     value strictly under 1.0 is physically only reachable through an
//     ultra-wide lens (digital crop can't zoom out below 1.0).
//   * Each physical child's raw focal length (from
//     `LENS_INFO_AVAILABLE_FOCAL_LENGTHS`) — ratios across siblings approximate
//     the optical zoom factor of the telephoto sibling. Rare on Android (the
//     adapter usually nulls these out) but reliable on iOS and on the OEMs
//     that do populate it.
//   * The count of physical children grouped into this logical multi-camera
//     (`physicalCameraInfos.size` → `device.physicalDevices.length`) — this
//     is the only multi-cam signal CameraX doesn't stub out, and a back
//     camera with `count >= 3` + `minZoom < 1` is the canonical
//     [ultra-wide, wide, telephoto] hardware on every shipped Android phone
//     that exposes a logical multi-cam (Samsung S20FE/S22/S23/S24, Pixel
//     6+ Pro, Xiaomi/Oppo/Vivo flagships).
//
// Per CLAUDE.md Rule 8 the dial still only renders pillars the device truly
// has: every pillar comes from a *real* CameraX value, never a hash, random,
// or platform guess. The lens-count inference is bounded by the OS's own
// grouping of cameras into a single logical device — we don't invent that
// grouping, we just read its size.
import type {
  CameraDeviceInfo,
  EnginePhysicalLensType,
} from '../../../components/pilgrimage/camera/camera-engine';
import type { FocalStop } from '../../../components/pilgrimage/camera/types';

const LENS_TO_STOP: Record<EnginePhysicalLensType, FocalStop> = {
  'ultra-wide-angle': 0.5,
  'wide-angle': 1,
  // Maps to 3× by default — iPhone 13/14/15/16 Pro telephoto. For older Pro
  // devices (11/12 Pro) where the telephoto is 2× optical, pass `telephotoStop: 2`.
  telephoto: 3,
};

const SWITCH_FACTOR_TOLERANCE = 0.15;

const ALL_STOPS: readonly FocalStop[] = [0.5, 1, 2, 3] as const;

/**
 * Snap boundary between the 2× and 3× pillars when inferring a telephoto from
 * the raw focal-length ratio of two physical siblings. Raw-mm ratios
 * systematically underestimate the optical zoom factor on smartphones because
 * the telephoto sensor is smaller than the main sensor (the extra crop
 * contributes to the perceived zoom). Empirical raw ratios across common
 * hardware:
 *   * iPhone 11/12 Pro (2× optical): ≈ 1.7–2.0
 *   * Pixel 6/7/8 + Samsung S22/S23/S24 (3× optical): ≈ 2.5–3.0
 *   * Pixel 8 Pro / Samsung S25 (5× optical): ≈ 2.4–3.5
 * A boundary of 2.2 keeps the 2× pillar for genuine 2× hardware while routing
 * everything 3× and up to the 3× pillar (the highest snap we expose).
 */
const TELEPHOTO_SNAP_BOUNDARY = 2.2;
const TELEPHOTO_MIN_RATIO = 1.7;

/** Any reported sub-1× minZoom is hardware-derived: digital crop cannot zoom
 *  out below 1.0, so the camera must have an ultra-wide lens in its physical
 *  set. Empirical reports across vendors that this catches:
 *    * Samsung Galaxy S20FE/S22/S23/S24: 0.5
 *    * iPhone Triple-Camera (iOS path uses physicalLensTypes, this is just
 *      defensive): 0.5
 *    * Xiaomi 12/13/14: 0.5-0.6
 *    * Oppo Find X5/X6 / Vivo X90/X100: 0.5-0.6
 *    * Pixel 6/7/8 / 8 Pro: 0.67 (Pixel's ultra-wide reach floor)
 *  Aligned with `ULTRA_WIDE_MIN_ZOOM_EXCLUSIVE = 1.0` in `android-camera-device.ts`
 *  so a device the picker selects (because its minZoom < 1) actually gets the
 *  0.5× pillar in the dial. A previous tighter threshold (0.65) silently
 *  dropped Pixel even though the picker correctly selected its multi-cam. */
const ULTRA_WIDE_MIN_ZOOM_EXCLUSIVE = 1;

/** Smartphone ultra-wide-angle lenses sit at ≤ 3.5mm raw focal length.
 *  Mainstream main-wide lenses are 4–8mm. Used to find which entry in the
 *  sorted `physicalFocalLengths` array is the "main" lens regardless of
 *  whether the ultra-wide entry was reported (Pixel: yes) or filtered out
 *  upstream because the OEM stubbed it as 0 (Xiaomi MIUI). */
const ULTRA_WIDE_FOCAL_LENGTH_MAX_MM = 3.5;

/** Count of physical lens children that signals a back-camera virtual device
 *  with a telephoto sibling on Android. CameraX's `PhysicalCameraInfoAdapter`
 *  stubs per-child `type` and `focalLength` (see camera-engine.ts comment on
 *  `physicalDeviceCount`), but the count is real — every shipped Android
 *  phone with `physicalDeviceCount >= 3` AND `minZoom < 1` carries
 *  `[ultra-wide, wide, telephoto]` hardware (Samsung S20FE/S22/S23/S24,
 *  Pixel 6+ Pro, Xiaomi/Oppo/Vivo flagships). 'dual' devices with sub-1×
 *  reach are dual-wide style (ultra-wide + wide, no telephoto), so the floor
 *  is 3. */
const VIRTUAL_DEVICE_COUNT_WITH_TELEPHOTO = 3;

function isFocalStop(value: number): value is FocalStop {
  return value === 0.5 || value === 1 || value === 2 || value === 3;
}

function dedupeSorted(stops: FocalStop[]): FocalStop[] {
  return [...new Set(stops)].sort((a, b) => a - b);
}

/**
 * Android fallback that infers focal stops from the three real signals we
 * still have access to when `physicalLensTypes` / `zoomLensSwitchFactors`
 * come back empty: the virtual device's `minZoom`, each physical child's raw
 * `focalLength` (when reported), and the count of physical children the OS
 * grouped into this logical multi-camera.
 *
 * Two sub-paths feed the telephoto pillar:
 *   1. Focal-length ratio (works on iOS for sanity-checking; works on Android
 *      only on the rare OEMs that expose per-child focals via
 *      `LENS_INFO_AVAILABLE_FOCAL_LENGTHS`). The "main" lens is the shortest
 *      focal above the ultra-wide cutoff (~3.5mm) — robust to either Pixel
 *      (all three focals reported) or Xiaomi MIUI (ultra-wide reported as 0
 *      and filtered out upstream by CameraStage).
 *   2. Lens count (the practical Android path). `physicalDeviceCount` is the
 *      only multi-cam signal CameraX doesn't stub out. `>= 3` + `minZoom < 1`
 *      reliably implies the third lens is a telephoto on every shipped
 *      Android phone with a logical back-camera multi-cam — no need to
 *      reconstruct focal lengths through Camera2 interop.
 */
function inferStopsFromFallbackSignals(
  info: CameraDeviceInfo,
  telephotoStop: 2 | 3
): FocalStop[] {
  const stops: FocalStop[] = [];
  const hasUltraWide = info.minZoom > 0 && info.minZoom < ULTRA_WIDE_MIN_ZOOM_EXCLUSIVE;
  if (hasUltraWide) stops.push(0.5);

  // Sub-path 1: per-child focal lengths reported (Pixel, iOS, OEMs that
  // happen to populate `LENS_INFO_AVAILABLE_FOCAL_LENGTHS` on the
  // PhysicalCameraInfoAdapter — rare but real).
  const lengths = info.physicalFocalLengths;
  let telephotoFromFocals = false;
  if (lengths.length >= 2) {
    const mainIndex = lengths.findIndex((f) => f > ULTRA_WIDE_FOCAL_LENGTH_MAX_MM);
    if (mainIndex >= 0) {
      const mainFocal = lengths[mainIndex];
      for (let i = mainIndex + 1; i < lengths.length; i++) {
        const ratio = lengths[i] / mainFocal;
        if (ratio < TELEPHOTO_MIN_RATIO) continue;
        stops.push(ratio <= TELEPHOTO_SNAP_BOUNDARY ? 2 : 3);
        telephotoFromFocals = true;
      }
    }
  }

  // Sub-path 2: lens-count signal. Only runs when sub-path 1 didn't already
  // surface a telephoto (so a Pixel with [1.6, 6.8, 19.4] keeps its
  // focal-derived 3× pillar, not a duplicate). Snaps to the caller-supplied
  // `telephotoStop` so legacy 2× hardware (iPhone 11 Pro / 12 Pro) doesn't
  // get mis-labelled — that override flows through from
  // `availableStopsFromDeviceInfo`.
  if (
    !telephotoFromFocals &&
    hasUltraWide &&
    info.physicalDeviceCount >= VIRTUAL_DEVICE_COUNT_WITH_TELEPHOTO
  ) {
    stops.push(telephotoStop);
  }

  return stops;
}

/**
 * Returns the focal-stop pillars the dial should render for this device.
 *
 * The priority order is:
 *   1. Physical lenses (`ultra-wide-angle` → 0.5, `wide-angle` → 1, `telephoto` → telephotoStop).
 *   2. Zoom-lens switch factors (when a virtual device auto-switches at e.g.
 *      `[1, 3]` we surface 1× and 3× as snap pillars).
 *   3. Android fallback — when (1) and (2) are both empty but the device looks
 *      like a multi-cam virtual device, infer pillars from `minZoom` and the
 *      raw focal lengths of the physical children.
 *   4. The neutral 1× pillar — always present so the dial isn't empty on
 *      single-lens hardware.
 *
 * Stops outside the device's `minZoom..maxZoom` window are filtered out.
 */
export function availableStopsFromDeviceInfo(
  info: CameraDeviceInfo | null,
  telephotoStop: 2 | 3 = 3
): FocalStop[] {
  if (!info) return [1];

  const stops: FocalStop[] = [];
  for (const lens of info.physicalLensTypes) {
    if (lens === 'telephoto') {
      stops.push(telephotoStop);
    } else {
      stops.push(LENS_TO_STOP[lens]);
    }
  }
  for (const factor of info.zoomLensSwitchFactors) {
    // The reported switch factor often lands near a familiar pillar (1, 2, 3) —
    // accept up to ±0.15× off so a device reporting 2.99× telephoto still gets
    // the 3× pillar.
    for (const candidate of ALL_STOPS) {
      if (Math.abs(factor - candidate) <= SWITCH_FACTOR_TOLERANCE) {
        stops.push(candidate);
      }
    }
    if (isFocalStop(factor)) stops.push(factor);
  }

  // Android path: both iOS-derived signals are empty, but CameraX still
  // hands us a real `minZoom`, per-child `focalLength` (sometimes), and the
  // count of physical children grouped into this logical multi-camera. Use
  // those before we fall back to the lonely 1× pillar. The trigger admits
  // any of the three signals so we don't ignore lens count on a phone where
  // CameraX happens to return minZoom == 1 transiently while still reporting
  // 3+ children.
  if (
    info.physicalLensTypes.length === 0 &&
    info.zoomLensSwitchFactors.length === 0 &&
    (info.minZoom < 1 ||
      info.physicalFocalLengths.length >= 2 ||
      info.physicalDeviceCount >= 2)
  ) {
    for (const inferred of inferStopsFromFallbackSignals(info, telephotoStop)) {
      stops.push(inferred);
    }
  }

  stops.push(1);

  // The 0.5× pillar is allowed whenever the device reports any sub-1× minZoom:
  // values like 0.6 are typical on Android multi-cams (vendor-dependent) and
  // would otherwise be filtered out by the `minZoom - 0.05` floor. Tapping the
  // pillar still routes through `useCameraZoom`, which clamps the request to
  // the real minZoom, so the camera never receives an out-of-range value.
  const lowerBoundFor = (s: FocalStop): number =>
    s === 0.5 && info.minZoom > 0 && info.minZoom < 1 ? 0 : info.minZoom - 0.05;
  const filtered = stops.filter((s) => s >= lowerBoundFor(s) && s <= info.maxZoom + 0.05);
  const deduped = dedupeSorted(filtered);
  return deduped.length > 0 ? deduped : [1];
}

/**
 * Returns true when the device exposes more than one focal-stop pillar — i.e.
 * the user has *some* optical (lens-switching) range, not just digital zoom.
 */
export function hasMultipleLenses(info: CameraDeviceInfo | null): boolean {
  return availableStopsFromDeviceInfo(info).length >= 2;
}
