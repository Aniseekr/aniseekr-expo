import { describe, expect, it } from 'bun:test';
import type { CameraDevice } from 'react-native-vision-camera';
import { selectAndroidBackDevice } from '../../../libs/services/pilgrimage/android-camera-device';

// VisionCamera's CameraDevice carries dozens of fields we don't need to set
// for the picker logic. The picker only touches position/minZoom/maxZoom/
// isVirtualDevice/physicalDevices[*].focalLength, so the test factory builds
// a partial shape and casts.
type DeviceLite = {
  id: string;
  position: 'back' | 'front';
  isVirtualDevice: boolean;
  minZoom: number;
  maxZoom: number;
  physicalDevices: { focalLength?: number }[];
};

function makeDevice(overrides: Partial<DeviceLite>): CameraDevice {
  const base: DeviceLite = {
    id: 'device-0',
    position: 'back',
    isVirtualDevice: false,
    minZoom: 1,
    maxZoom: 1,
    physicalDevices: [],
    ...overrides,
  };
  return base as unknown as CameraDevice;
}

describe('selectAndroidBackDevice', () => {
  it('returns null when the device list is empty', () => {
    expect(selectAndroidBackDevice([])).toBeNull();
  });

  it('returns null when there are no back devices', () => {
    const onlyFront = makeDevice({ id: 'front-0', position: 'front', minZoom: 1, maxZoom: 1 });
    expect(selectAndroidBackDevice([onlyFront])).toBeNull();
  });

  it('returns null on a single-lens phone (no sub-1x minZoom anywhere)', () => {
    // Pixel 6a-shaped: a single wide-angle back camera with no ultra-wide.
    // The dial should fall through to VisionCamera's stock picker (which
    // will return this exact device) and then render only the 1x pillar.
    const wide = makeDevice({
      id: 'pixel-6a-wide',
      isVirtualDevice: false,
      minZoom: 1,
      maxZoom: 8,
      physicalDevices: [],
    });
    expect(selectAndroidBackDevice([wide])).toBeNull();
  });

  it('picks the virtual multi-cam over a single wide when both are present', () => {
    // The exact Samsung S20FE / S22 shape: CameraX exposes both a standalone
    // wide-angle (minZoom 1) AND a virtual logical multi-camera that pulls in
    // the ultra-wide (minZoom 0.5). VisionCamera's stock picker would pick
    // the standalone wide because it scores higher with `type === 'unknown'`
    // children; ours correctly picks the multi-cam.
    const wideAlone = makeDevice({
      id: 's20fe-wide-only',
      isVirtualDevice: false,
      minZoom: 1,
      maxZoom: 10,
      physicalDevices: [],
    });
    const multiCam = makeDevice({
      id: 's20fe-multicam',
      isVirtualDevice: true,
      minZoom: 0.5,
      maxZoom: 30,
      physicalDevices: [{ focalLength: 1.6 }, { focalLength: 5.4 }, { focalLength: 19 }],
    });
    expect(selectAndroidBackDevice([wideAlone, multiCam])?.id).toBe('s20fe-multicam');
  });

  it('prefers the virtual multi-cam with the larger maxZoom (more telephoto reach)', () => {
    // Two virtual back devices on the same phone, both with ultra-wide
    // child. The one with bigger maxZoom carries the telephoto sibling and
    // gives the dial a real 3x pillar via the focal-length fallback in
    // lens-switching.ts. The slimmer (no-telephoto) multi-cam should lose.
    const noTele = makeDevice({
      id: 'multicam-ww-no-tele',
      isVirtualDevice: true,
      minZoom: 0.5,
      maxZoom: 8,
      physicalDevices: [{ focalLength: 1.6 }, { focalLength: 5.4 }],
    });
    const withTele = makeDevice({
      id: 'multicam-uw-w-tele',
      isVirtualDevice: true,
      minZoom: 0.5,
      maxZoom: 30,
      physicalDevices: [{ focalLength: 1.6 }, { focalLength: 5.4 }, { focalLength: 19 }],
    });
    expect(selectAndroidBackDevice([noTele, withTele])?.id).toBe('multicam-uw-w-tele');
  });

  it('falls through to tier 2 (minZoom < 1 alone) when no candidate has both signals', () => {
    // Xiaomi MIUI flavor: ultra-wide exists (minZoom 0.6 reported by
    // CameraX zoomState), but the physical-child focalLength is missing
    // (vendor stubs it as 0). Tier 1 requires both signals so this device
    // doesn't qualify, but tier 2 (minZoom only) does. The picker should
    // still surface this device — the alternative would be to silently
    // ignore the hardware's ultra-wide reach.
    const xiaomiMultiCam = makeDevice({
      id: 'xiaomi-multicam-no-focal',
      isVirtualDevice: true,
      minZoom: 0.6,
      maxZoom: 15,
      physicalDevices: [
        // CameraX returned no focal length for the ultra-wide child:
        {},
        { focalLength: 5.4 },
      ],
    });
    const standaloneWide = makeDevice({
      id: 'xiaomi-wide-only',
      isVirtualDevice: false,
      minZoom: 1,
      maxZoom: 10,
      physicalDevices: [],
    });
    expect(selectAndroidBackDevice([xiaomiMultiCam, standaloneWide])?.id).toBe(
      'xiaomi-multicam-no-focal'
    );
  });

  it('ignores front-facing devices even if they would otherwise qualify', () => {
    // Defensive: front cameras never have ultra-wide on phones in this app's
    // range. If a future device reports a sub-1x front camera (TrueDepth
    // virtual on iPad Pro etc.), this picker is back-camera only — the
    // front path always goes through useCameraDevice's stock filter.
    const frontMultiCam = makeDevice({
      id: 'front-virtual',
      position: 'front',
      isVirtualDevice: true,
      minZoom: 0.5,
      maxZoom: 5,
      physicalDevices: [{ focalLength: 1.6 }, { focalLength: 4.2 }],
    });
    expect(selectAndroidBackDevice([frontMultiCam])).toBeNull();
  });

  it('treats minZoom of exactly 1.0 as no ultra-wide (Rule 8: no fake data)', () => {
    // A device that reports minZoom === 1.0 cannot reach 0.5x via hardware;
    // exposing a 0.5x pillar there would be a digital crop pretending to be
    // an ultra-wide capture. The picker must NOT pick this device just
    // because it's virtual.
    const fakeMultiCam = makeDevice({
      id: 'fake-multicam',
      isVirtualDevice: true,
      minZoom: 1.0,
      maxZoom: 10,
      physicalDevices: [{ focalLength: 5.4 }, { focalLength: 19 }],
    });
    expect(selectAndroidBackDevice([fakeMultiCam])).toBeNull();
  });

  it('ignores non-finite minZoom values that some sticks report', () => {
    // Edge case: CameraX docs say zoomState can be null very briefly during
    // configuration. VisionCamera's getter then returns 0 (see
    // HybridCameraDevice.minZoom). Treat 0 as "unknown" rather than
    // accidentally accepting it as a sub-1x ultra-wide signal.
    const stillBooting = makeDevice({
      id: 'booting',
      isVirtualDevice: true,
      minZoom: 0,
      maxZoom: 0,
      physicalDevices: [{ focalLength: 1.6 }, { focalLength: 5.4 }],
    });
    expect(selectAndroidBackDevice([stillBooting])).toBeNull();
  });
});
