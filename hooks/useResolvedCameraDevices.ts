// Plural successor to `useResolvedCameraDevice`. Returns the full cohort
// (primary + optional standalone children + strategy) instead of just one
// active CameraDevice, so the dial / zoom / capture layers can route based
// on which lens the session is currently using and what alternative lenses
// exist.
//
// On iOS the strategy is always `logical` (Apple groups the Triple-Camera
// into a single virtual device). On Android the strategy depends on what
// CameraX exposes for the specific model — see `device-cohort.ts`.
//
// Per CLAUDE.md Rule 8: `cohort` is `null` until the OS has finished
// enumerating; the caller MUST render a real loading state, never a
// hardcoded "0.5/1/2/3" filler dial.
//
// Cohort cache (Phase 1, Rule 10): once a fresh classification resolves we
// persist a snapshot keyed by device fingerprint + build number. The
// snapshot's `cachedSnapshot` is exposed for callers that want to anticipate
// dial layout (e.g. "does this device have an island chip?") *before* live
// enumeration completes. The cache cannot synthesise live `CameraDevice`
// handles — those still come from VisionCamera's enumerate — so it is
// strictly a layout hint, not a session source.
import * as Application from 'expo-application';
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { useCameraDevices, type CameraDevice } from 'react-native-vision-camera';
import { classifyCohort, type DeviceCohort } from '../libs/services/pilgrimage/device-cohort';
import type { CohortFacing, CohortSnapshot } from '../libs/services/pilgrimage/device-cohort-cache';
import type { CameraEngineFacing } from '../libs/services/pilgrimage/camera-engine-parity';
import { useDeviceCohortCache } from './useDeviceCohortCache';

export interface ResolvedCameraDevicesResult {
  /** The classified cohort, or `null` until enumeration completes / no
   *  back-facing devices exist. */
  readonly cohort: DeviceCohort | null;
  /** Raw device list, exposed so callers can do extra inspection without
   *  re-subscribing to VisionCamera. */
  readonly devices: readonly CameraDevice[];
  /** Last-known snapshot from a previous cold launch. Null on first launch.
   *  Use this to predict
   *  layout (island chip / strategy) before `cohort` resolves; the actual
   *  camera session always uses `cohort`. */
  readonly cachedSnapshot: CohortSnapshot | null;
}

/**
 * Looks up a stable manufacturer/model identity for cache keying. On Android
 * we read `Platform.constants.Manufacturer` / `Model` (native Build.* fields).
 * On iOS we use a constant because the cohort is always `logical` and the
 * cache is just a no-op codepath for parity.
 */
function deviceIdentity(facing: CameraEngineFacing): {
  manufacturer: string;
  modelID: string;
  facing: CohortFacing;
} {
  const cohortFacing: CohortFacing = facing === 'front' ? 'front' : 'back';
  if (Platform.OS === 'android') {
    const constants = Platform.constants as unknown as {
      Manufacturer?: string;
      Model?: string;
    };
    return {
      manufacturer: constants.Manufacturer ?? 'unknown',
      modelID: constants.Model ?? 'unknown',
      facing: cohortFacing,
    };
  }
  return {
    manufacturer: 'apple',
    modelID: 'ios',
    facing: cohortFacing,
  };
}

/**
 * Returns the cohort classification for the rear camera (or the single
 * front device when `facing === 'front'`). On iOS the cohort is always
 * `logical`. On Android we re-classify because VisionCamera's stock
 * picker doesn't expose multi-device structure.
 */
export function useResolvedCameraDevices(facing: CameraEngineFacing): ResolvedCameraDevicesResult {
  const devices = useCameraDevices();
  const identity = useMemo(() => deviceIdentity(facing), [facing]);
  const { snapshot, save } = useDeviceCohortCache(identity);

  const cohort = useMemo<DeviceCohort | null>(() => {
    if (facing === 'front') {
      // Prefer a real `wide-angle` front camera over any other front-facing
      // device. Defensive against Samsung phones that expose non-photographic
      // sensors (the ambient-brightness sensor used by
      // `com.samsung.adaptivebrightnessgo` on the S20FE shows up as
      // position='front', type='telephoto', focalLength≈3.72mm — confirmed
      // via real-device dump). VisionCamera's stock picker considers all
      // front devices, so without this filter we could occasionally bind
      // the preview to a tiny luminance sensor and hand the user a black
      // preview / broken AE-AF.
      const wideFront = devices.find((d) => d.position === 'front' && d.type === 'wide-angle');
      const fallbackFront = wideFront ?? devices.find((d) => d.position === 'front');
      return fallbackFront ? { strategy: 'wide-only', primary: fallbackFront } : null;
    }
    // Back: classify. On iOS the picker still ends up at `logical` because
    // Apple's Triple-Camera reports minZoom 0.5 directly, so we don't need
    // a platform branch here — the math takes care of it.
    return classifyCohort(devices);
  }, [devices, facing]);

  // Persist the latest classification. `save()` debounces identical writes
  // (same strategy + same device IDs) so we don't churn MMKV; it's safe to
  // call from a render-driven effect.
  useEffect(() => {
    if (!cohort) return;
    save({
      strategy: cohort.strategy,
      primaryDeviceId: cohort.primary.id,
      ultraWideDeviceId: cohort.ultraWide?.id,
      telephotoDeviceId: cohort.telephoto?.id,
      manufacturer: identity.manufacturer,
      modelID: identity.modelID,
      facing: identity.facing,
      buildNumber: Application.nativeBuildVersion ?? '0',
      savedAtMs: Date.now(),
    });
  }, [cohort, identity, save]);

  return useMemo(
    () => ({ cohort, devices, cachedSnapshot: snapshot }),
    [cohort, devices, snapshot]
  );
}
