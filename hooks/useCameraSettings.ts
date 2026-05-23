import { useCallback, useState } from 'react';
import {
  loadCameraSettingsSync,
  saveCameraSettings,
  type CameraSettings,
} from '../libs/services/pilgrimage/camera-settings';

// Re-export the types/constants/helpers so callers can do
// `import { useCameraSettings, qualityToNumber } from '@/hooks/useCameraSettings'`
// without reaching into libs/services for every related symbol.
export {
  CAMERA_SETTINGS_STORAGE_KEY,
  CAPTURE_MODES,
  COUNTDOWN_SECONDS,
  DEFAULT_CAMERA_SETTINGS,
  PICTURE_QUALITIES,
  RESOLUTION_TIERS,
  qualityToNumber,
  qualityToPrioritization,
} from '../libs/services/pilgrimage/camera-settings';
export type {
  CameraSettings,
  CaptureMode,
  CountdownSeconds,
  PictureQuality,
  ResolutionTier,
} from '../libs/services/pilgrimage/camera-settings';

export interface UseCameraSettingsResult {
  settings: CameraSettings;
  setSettings: (patch: Partial<CameraSettings>) => void;
  hydrated: boolean;
}

/**
 * Loads persisted camera settings and writes through on each change.
 *
 * Initial state is seeded synchronously from MMKV, so the camera screen opens
 * with the user's real settings on the first frame. Writes are fire-and-forget
 * so the UI never waits on storage. `hydrated` is always true — kept on the
 * return type for back-compat with callers that gate UI on it.
 */
export function useCameraSettings(): UseCameraSettingsResult {
  const [settings, setSettingsState] = useState<CameraSettings>(loadCameraSettingsSync);

  const setSettings = useCallback((patch: Partial<CameraSettings>) => {
    setSettingsState((prev) => {
      const next: CameraSettings = { ...prev, ...patch };
      void saveCameraSettings(next);
      return next;
    });
  }, []);

  return { settings, setSettings, hydrated: true };
}
