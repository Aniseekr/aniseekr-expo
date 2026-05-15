import { describe, expect, it } from 'bun:test';
import {
  cameraOrientationLockIntent,
  formatCameraHeader,
  isCameraCapturePath,
  roundExposureValue,
} from '../../../libs/services/pilgrimage/camera-ui';

describe('camera UI helpers', () => {
  it('keeps the camera top bar generic and English instead of showing raw spot names', () => {
    const header = formatCameraHeader({
      sceneName: '町田駅北口',
      animeTitle: 'Date A Live',
      ep: '4',
    });

    expect(header.title).toBe('Scene Match');
    expect(header.subtitle).toBe('Date A Live · EP 4');
    expect(header.title).not.toContain('町田');
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
});
