// Neutral camera engine surface — the single seam between the pilgrimage
// camera HUD and the underlying native camera implementation.
//
// Everything in this app (hooks, the screen, capture services) talks to the
// engine through these types. `CameraStage` is the only file that imports
// react-native-vision-camera and wires the engine implementation. Swapping
// engines later means rewriting `CameraStage`, not the screen or the hooks.
//
// The engine reports real device capabilities (zoom range, EV bias range,
// hardware HDR, physical lens types) instead of the previous expo-camera
// guesses, so the HUD can render honest UI.
import type { RefObject } from 'react';

/** A captured photo on disk, with `file://` URI. */
export interface EnginePhoto {
  uri: string;
  width: number;
  height: number;
}

/**
 * Capture options forwarded to the engine. Mirrors VisionCamera's
 * `CapturePhotoSettings` subset we actually use — keep this minimal.
 */
export interface EngineCaptureOptions {
  /** Flash mode for this capture. Torch is set via the live `torchMode` prop, not here. */
  flashMode?: 'on' | 'off' | 'auto';
  /** When false, suppress the system shutter sound. Mapped to settings.mute. */
  enableShutterSound?: boolean;
}

/**
 * Cross-platform names for the physical lens hardware exposed by the device.
 * Mirrors VisionCamera's {@link DeviceType} subset we care about. Replaces the
 * iOS-only Apple `builtIn*Camera` strings from the old expo-camera lens
 * switcher.
 */
export type EnginePhysicalLensType = 'ultra-wide-angle' | 'wide-angle' | 'telephoto';

export interface CameraDeviceInfo {
  /** Real zoom factor units (e.g. iPhone 15 Pro: 0.5 → 15). */
  minZoom: number;
  maxZoom: number;
  /** Factor at which the device's "default" view sits — `1` on every device we target. */
  neutralZoom: number;
  /** Physical lenses available on this device. Empty if the device is a single-lens phone. */
  physicalLensTypes: EnginePhysicalLensType[];
  /**
   * Zoom factors at which the OS auto-switches between physical lenses on a
   * virtual multi-camera device (e.g. Triple-Camera reports `[1, 3]`). Empty
   * for single-lens devices.
   */
  zoomLensSwitchFactors: number[];
  /**
   * Raw focal length (in mm on Android, 35mm-equivalent on iOS) of each
   * constituent physical lens, sorted ascending. Populated from the parent
   * device's `physicalDevices` children; entries with no reported focal length
   * are skipped. Used as the Android-side fallback signal for lens detection
   * because CameraX's `PhysicalCameraInfoAdapter` reports every child's
   * {@link physicalLensTypes | type} as `UNKNOWN` and the virtual device's
   * {@link zoomLensSwitchFactors} as empty (VisionCamera Android bug: the
   * extension stubs that data out to avoid a Camera2 interop crash).
   */
  physicalFocalLengths: number[];
  /**
   * Count of physical lens children for a logical multi-camera virtual
   * device, as reported by the OS (`device.physicalDevices.length`). `0` for
   * single-lens devices, `2`-`4` for multi-cam virtual devices ('dual',
   * 'triple', 'quad').
   *
   * This is the count signal we still have on Android when each child's type
   * is `UNKNOWN` and focalLength is `null` (CameraX `PhysicalCameraInfoAdapter`
   * does not expose Camera2 characteristics for children — upstream tracking:
   * https://issuetracker.google.com/issues/496096527). A back-camera virtual
   * device with `physicalDeviceCount >= 3` AND `minZoom < 1` is the canonical
   * `[ultra-wide, wide, telephoto]` hardware on every shipped Android phone
   * that exposes a logical multi-camera (Samsung S20FE/S22/S23/S24, Pixel
   * 6+ Pro, Xiaomi/Oppo/Vivo flagships) — lets the dial surface the 3× pillar
   * that the focal-length-ratio path can't reach when children focals are
   * stubbed out.
   */
  physicalDeviceCount: number;
  /** True if the device's chosen format supports real photo-HDR capture. */
  supportsPhotoHdr: boolean;
  /** Real exposure bias range in EV units. `0`/`0` if the device doesn't support bias. */
  minExposureBias: number;
  maxExposureBias: number;
  /** Whether {@link CameraEngineHandle.focus} can actually move the focus point. */
  supportsFocusMetering: boolean;
  /** Hardware flash + torch availability. */
  hasFlash: boolean;
  hasTorch: boolean;
}

/**
 * Imperative camera surface consumed by the capture hooks and the screen.
 * Always obtained as a `useRef<CameraEngineHandle | null>(null)`.
 *
 * The methods are stable for the lifetime of the engine — safe to omit from
 * useEffect deps once the ref is set.
 */
export interface CameraEngineHandle {
  /**
   * Capture a still photo to a temporary file. Resolves to `null` if the
   * engine isn't ready, or rejects on a native failure.
   */
  takePhoto(opts?: EngineCaptureOptions): Promise<EnginePhoto | null>;
  /**
   * Run an AE/AF/AWB metering operation at the given view-coordinate point
   * (relative to the camera preview). No-op when the device can't meter.
   */
  focus(point: { x: number; y: number }): Promise<void>;
  /** Latest device capabilities. `null` while the camera is still starting up. */
  getDeviceInfo(): CameraDeviceInfo | null;
}

export type CameraEngineRef = RefObject<CameraEngineHandle | null>;
