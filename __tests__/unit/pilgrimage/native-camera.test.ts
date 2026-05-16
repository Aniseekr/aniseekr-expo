import { describe, expect, it } from 'bun:test';
import {
  androidNativeStopsForCapabilities,
  androidStopZoomMap,
  sanitizeAndroidCameraCapabilities,
  shouldUseAndroidNativeHdr,
  zoomRatioForZoomValue,
  zoomValueForRatio,
} from '../../../libs/services/pilgrimage/native-camera';

describe('Android native camera helpers', () => {
  it('only exposes 0.5x when CameraX reports real zoom-out support', () => {
    expect(
      androidNativeStopsForCapabilities({
        minZoomRatio: 0.5,
        maxZoomRatio: 8,
        zoomRatio: 1,
        supportsZoomOut: true,
        activeExtensionMode: 'none',
        extensions: { hdr: false, night: false, auto: false },
      })
    ).toEqual([0.5, 1, 2, 3]);

    expect(
      androidNativeStopsForCapabilities({
        minZoomRatio: 0.7,
        maxZoomRatio: 2.5,
        zoomRatio: 1,
        supportsZoomOut: true,
        activeExtensionMode: 'none',
        extensions: { hdr: false, night: false, auto: false },
      })
    ).toEqual([1, 2]);

    expect(
      androidNativeStopsForCapabilities({
        minZoomRatio: 1,
        maxZoomRatio: 1.8,
        zoomRatio: 1,
        supportsZoomOut: false,
        activeExtensionMode: 'none',
        extensions: { hdr: false, night: false, auto: false },
      })
    ).toEqual([1]);
  });

  it('maps 0.5x, 1x, and tele stops across the native zoom range', () => {
    const caps = sanitizeAndroidCameraCapabilities({
      minZoomRatio: 0.5,
      maxZoomRatio: 8,
      zoomRatio: 1,
      supportsZoomOut: true,
      extensions: { hdr: true, night: false, auto: false },
    });

    const stopZoom = androidStopZoomMap(caps);

    expect(stopZoom[0.5]).toBeCloseTo(0, 10);
    expect(stopZoom[1]).toBeGreaterThan(stopZoom[0.5]);
    expect(stopZoom[2]).toBeGreaterThan(stopZoom[1]);
    expect(stopZoom[3]).toBeGreaterThan(stopZoom[2]);

    expect(zoomRatioForZoomValue(stopZoom[0.5], caps)).toBeCloseTo(0.5, 6);
    expect(zoomRatioForZoomValue(stopZoom[1], caps)).toBeCloseTo(1, 6);
    expect(zoomRatioForZoomValue(stopZoom[2], caps)).toBeCloseTo(2, 6);
    expect(zoomRatioForZoomValue(stopZoom[3], caps)).toBeCloseTo(3, 6);
  });

  it('keeps ratio and zoom-value conversion invertible within the native range', () => {
    const caps = sanitizeAndroidCameraCapabilities({
      minZoomRatio: 0.5,
      maxZoomRatio: 10,
      zoomRatio: 1,
      supportsZoomOut: true,
      extensions: { hdr: false, night: false, auto: false },
    });

    for (const ratio of [0.5, 0.75, 1, 2, 5, 10]) {
      expect(zoomRatioForZoomValue(zoomValueForRatio(ratio, caps), caps)).toBeCloseTo(ratio, 6);
    }
  });

  it('uses Android native HDR only when the requested mode and capability both match', () => {
    const supported = sanitizeAndroidCameraCapabilities({
      minZoomRatio: 1,
      maxZoomRatio: 6,
      zoomRatio: 1,
      supportsZoomOut: false,
      extensions: { hdr: true, night: false, auto: false },
    });
    const unsupported = sanitizeAndroidCameraCapabilities({
      minZoomRatio: 1,
      maxZoomRatio: 6,
      zoomRatio: 1,
      supportsZoomOut: false,
      extensions: { hdr: false, night: false, auto: false },
    });

    expect(shouldUseAndroidNativeHdr('android', 'hdr', supported)).toBe(true);
    expect(shouldUseAndroidNativeHdr('android', 'single', supported)).toBe(false);
    expect(shouldUseAndroidNativeHdr('ios', 'hdr', supported)).toBe(false);
    expect(shouldUseAndroidNativeHdr('android', 'hdr', unsupported)).toBe(false);
    expect(shouldUseAndroidNativeHdr('android', 'hdr', null)).toBe(false);
  });
});
