// expo-camera v17 has no exposure prop. This hook simulates exposure via two layers:
// (a) a translucent overlay over the live preview for visual hint,
// (b) a Skia ColorMatrix applied to the captured image post-shutter for REAL brightness
// change in the output. Not true exposure (no ISO/shutter speed change), but real
// brightness control. EV math is stop-based: pow(2, value).
import { useMemo } from 'react';
import { Skia } from '@shopify/react-native-skia';
import type { SkColorFilter } from '@shopify/react-native-skia';

interface UseBrightnessPreviewInput {
  value: number;
}

interface UseBrightnessPreviewOutput {
  overlayStyle: {
    backgroundColor: string;
    opacity: number;
  };
  colorMatrix: number[];
  colorFilter: SkColorFilter | null;
}

export function useBrightnessPreview({
  value,
}: UseBrightnessPreviewInput): UseBrightnessPreviewOutput {
  const colorMatrix = useMemo(() => {
    const b = Math.pow(2, value);
    return [
      b, 0, 0, 0, 0,
      0, b, 0, 0, 0,
      0, 0, b, 0, 0,
      0, 0, 0, 1, 0,
    ];
  }, [value]);

  const colorFilter = useMemo<SkColorFilter | null>(() => {
    if (value === 0) return null;
    return Skia.ColorFilter.MakeMatrix(colorMatrix);
  }, [value, colorMatrix]);

  const overlayStyle = useMemo(() => {
    if (value === 0) {
      return { backgroundColor: 'rgba(0,0,0,1)', opacity: 0 };
    }
    if (value < 0) {
      return {
        backgroundColor: 'rgba(0,0,0,1)',
        opacity: Math.min(Math.abs(value) * 0.22, 0.45),
      };
    }
    return {
      backgroundColor: 'rgba(255,255,255,1)',
      opacity: Math.min(value * 0.18, 0.36),
    };
  }, [value]);

  return { overlayStyle, colorMatrix, colorFilter };
}
