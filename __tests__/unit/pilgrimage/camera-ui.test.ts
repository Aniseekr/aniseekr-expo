import { describe, expect, it } from 'bun:test';
import {
  ANDROID_GESTURE_NAV_MIN_INSET,
  cameraOrientationLockIntent,
  CAMERA_BOTTOM_BAR_CONTENT_HEIGHT,
  CAMERA_LANDSCAPE_CLUSTER_RESERVE,
  CAMERA_SHUTTER_ROW_HEIGHT,
  CAMERA_TOP_BAR_CONTENT_HEIGHT,
  CAMERA_TOP_BAR_ROW2_HEIGHT,
  formatCameraHeader,
  isCameraCapturePath,
  resolveCameraBottomInset,
  resolveCameraActive,
  resolveCameraTopChromeHeight,
  resolveTransientCameraHudVisibility,
  roundExposureValue,
} from '../../../libs/services/pilgrimage/camera-ui';

describe('camera UI helpers', () => {
  it('composes an English anime + episode line for the camera header subtitle', () => {
    const header = formatCameraHeader({
      sceneName: '町田駅北口',
      animeTitle: 'Date A Live',
      ep: '4',
    });

    expect(header.subtitle).toBe('Date A Live · EP 4');
  });

  it('falls back to English scene copy when anime metadata is missing', () => {
    expect(formatCameraHeader({ sceneName: '修学院駅', ep: '2' })).toEqual({
      title: 'Scene Match',
      subtitle: 'EP 2 · anime scene',
    });
  });

  it('only treats the dynamic capture screen as orientation-unlocked camera UI', () => {
    expect(isCameraCapturePath('/pilgrimage/compare/abc123')).toBe(true);
    expect(isCameraCapturePath('/pilgrimage/compare/tips')).toBe(false);
    expect(isCameraCapturePath('/pilgrimage/compare/align')).toBe(false);
    expect(isCameraCapturePath('/pilgrimage/compare/preview')).toBe(false);
    expect(isCameraCapturePath('/pilgrimage')).toBe(false);
  });

  it('requests flexible landscape instead of pinning the camera to the right side', () => {
    expect(cameraOrientationLockIntent('auto')).toBe('unlock');
    expect(cameraOrientationLockIntent('landscape')).toBe('landscape');
  });

  it('rounds AF exposure bar values to clamped one-decimal EV values', () => {
    expect(roundExposureValue(0.96)).toBe(1);
    expect(roundExposureValue(-4)).toBe(-2);
    expect(roundExposureValue(2.44)).toBe(2);
  });

  it('only keeps the native camera active while foregrounded and unobscured', () => {
    expect(resolveCameraActive({ appIsForeground: true, settingsOpen: false })).toBe(true);
    expect(resolveCameraActive({ appIsForeground: false, settingsOpen: false })).toBe(false);
    expect(resolveCameraActive({ appIsForeground: true, settingsOpen: true })).toBe(false);
  });

  it('keeps the slim camera chrome large enough for its controls', () => {
    // Row 1 must clear an iOS HIG touch target; the collapsible Row-2 strip
    // must fit its chips (36px chip + 14px padding = 50px, bound at 52).
    // The bottom panel is shutter-only; overlay controls live in a dock that
    // can collapse instead of permanently consuming the lower viewport.
    expect(CAMERA_TOP_BAR_CONTENT_HEIGHT).toBeGreaterThanOrEqual(44);
    expect(CAMERA_BOTTOM_BAR_CONTENT_HEIGHT).toBeGreaterThanOrEqual(CAMERA_SHUTTER_ROW_HEIGHT);
    expect(CAMERA_BOTTOM_BAR_CONTENT_HEIGHT).toBeLessThan(120);
    expect(CAMERA_TOP_BAR_ROW2_HEIGHT).toBeGreaterThanOrEqual(44);
    expect(CAMERA_LANDSCAPE_CLUSTER_RESERVE).toBeGreaterThanOrEqual(78);
  });

  it('adds Row-2 height only while quick controls are expanded', () => {
    expect(resolveCameraTopChromeHeight({ quickControlsOpen: false })).toBe(
      CAMERA_TOP_BAR_CONTENT_HEIGHT
    );
    expect(resolveCameraTopChromeHeight({ quickControlsOpen: true })).toBe(
      CAMERA_TOP_BAR_CONTENT_HEIGHT + CAMERA_TOP_BAR_ROW2_HEIGHT
    );
  });

  it('hides transient HUD layers while the overlay dock is open', () => {
    expect(
      resolveTransientCameraHudVisibility({ afLocked: true, overlayControlsOpen: true })
    ).toEqual({
      showAutoCaptureBadge: false,
      showCaptureHistory: false,
      showFocusExposureBar: false,
    });

    expect(
      resolveTransientCameraHudVisibility({ afLocked: true, overlayControlsOpen: false })
    ).toEqual({
      showAutoCaptureBadge: true,
      showCaptureHistory: true,
      showFocusExposureBar: true,
    });

    expect(resolveTransientCameraHudVisibility({ afLocked: false })).toEqual({
      showAutoCaptureBadge: true,
      showCaptureHistory: true,
      showFocusExposureBar: false,
    });
  });

  it('floors the Android camera bottom inset so the gesture bar cannot cover the shutter', () => {
    // Android edge-to-edge can mis-report the gesture-bar inset as 0.
    expect(resolveCameraBottomInset(0, 'android')).toBe(ANDROID_GESTURE_NAV_MIN_INSET);
    expect(resolveCameraBottomInset(10, 'android')).toBe(ANDROID_GESTURE_NAV_MIN_INSET);
    // A genuine, larger inset (e.g. the three-button nav bar) is kept as-is.
    expect(resolveCameraBottomInset(48, 'android')).toBe(48);
  });

  it('trusts the reported home-indicator inset on iOS', () => {
    expect(resolveCameraBottomInset(34, 'ios')).toBe(34);
    expect(resolveCameraBottomInset(0, 'ios')).toBe(0);
  });

  it('treats a non-finite or negative reported inset as zero before flooring', () => {
    expect(resolveCameraBottomInset(Number.NaN, 'ios')).toBe(0);
    expect(resolveCameraBottomInset(-5, 'ios')).toBe(0);
    expect(resolveCameraBottomInset(-5, 'android')).toBe(ANDROID_GESTURE_NAV_MIN_INSET);
  });
});
