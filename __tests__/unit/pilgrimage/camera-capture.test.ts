import { describe, expect, it } from 'bun:test';
import {
  mergeCaptureExif,
  resolveCapturedUri,
} from '../../../libs/services/pilgrimage/camera-capture';

describe('camera capture helpers', () => {
  it('normalizes native capture results from Android uri and iOS url shapes', () => {
    expect(resolveCapturedUri({ uri: 'file:///android.jpg' })).toBe('file:///android.jpg');
    expect(resolveCapturedUri({ url: 'file:///ios.jpg' })).toBe('file:///ios.jpg');
    expect(resolveCapturedUri({ uri: 'file:///preferred.jpg', url: 'file:///fallback.jpg' })).toBe(
      'file:///preferred.jpg'
    );
  });

  it('keeps additional EXIF when native save/capture does not return an exif object', () => {
    const additionalExif = {
      GPSLatitude: 35.6812,
      GPSLongitude: 139.7671,
      UserComment: '{"spotId":"tokyo-station"}',
    };

    expect(mergeCaptureExif(null, additionalExif)).toEqual(additionalExif);
    expect(mergeCaptureExif(undefined, additionalExif)).toEqual(additionalExif);
  });

  it('merges native EXIF with app EXIF while preserving app fields absent from native output', () => {
    const additionalExif = {
      GPSLatitude: 35.6812,
      GPSLongitude: 139.7671,
      UserComment: '{"spotId":"tokyo-station"}',
    };
    const nativeExif = {
      Orientation: 1,
      Make: 'Apple',
      GPSLatitude: 35.6813,
    };

    expect(mergeCaptureExif(nativeExif, additionalExif)).toEqual({
      ...additionalExif,
      ...nativeExif,
    });
  });
});
