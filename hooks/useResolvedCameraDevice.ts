// Picks the active VisionCamera device with an Android-specific override
// for the rear camera.
//
// Why this exists:
// VisionCamera's stock `useCameraDevice` scores candidates by
// `device.physicalDevices[i].type` (see devices/getCameraDevice.ts in
// react-native-vision-camera). On Android the CameraX adapter returns
// `UNKNOWN` for every `PhysicalCameraInfoAdapter` child, so a real
// multi-cam virtual device (Triple-Camera with ultra-wide reach) scores
// -3 while a single-lens wide-angle device scores 0 — the algorithm
// reliably picks the single-lens device and we lose the 0.5× reach.
//
// On iOS the stock picker works correctly because Apple's physical
// children carry real type strings, so we just call straight through.
// The Android branch goes through `selectAndroidBackDevice`, which
// re-scores using the underlying CameraX values that ARE coming through
// correctly (minZoom, isVirtualDevice, physical-child focalLength).
//
// Per CLAUDE.md Rule 8 the Android picker returns `null` when no
// candidate truly reports a sub-1× minZoom, and we fall through to
// VisionCamera's stock pick — which on a single-lens phone returns the
// only available device and lets the dial honestly render just the 1×
// pillar.
import { useMemo } from 'react';
import { Platform } from 'react-native';
import {
  getCameraDevice,
  useCameraDevices,
  type CameraDevice,
} from 'react-native-vision-camera';
import { selectAndroidBackDevice } from '../libs/services/pilgrimage/android-camera-device';
import {
  preferredPhysicalDevicesForFacing,
  type CameraEngineFacing,
} from '../libs/services/pilgrimage/camera-engine-parity';

export function useResolvedCameraDevice(facing: CameraEngineFacing): CameraDevice | undefined {
  const devices = useCameraDevices();
  return useMemo(() => {
    if (Platform.OS === 'android' && facing === 'back') {
      const picked = selectAndroidBackDevice(devices);
      if (picked) return picked;
    }
    return getCameraDevice(devices, facing, {
      physicalDevices: [...preferredPhysicalDevicesForFacing(facing)],
    });
  }, [devices, facing]);
}
