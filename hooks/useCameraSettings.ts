import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_CAMERA_SETTINGS,
  loadCameraSettings,
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
  qualityToNumber,
} from '../libs/services/pilgrimage/camera-settings';
export type {
  CameraSettings,
  CaptureMode,
  CountdownSeconds,
  PictureQuality,
} from '../libs/services/pilgrimage/camera-settings';

export interface UseCameraSettingsResult {
  settings: CameraSettings;
  setSettings: (patch: Partial<CameraSettings>) => void;
  hydrated: boolean;
}

/**
 * Loads persisted camera settings on mount and writes through on each change.
 *
 * Writes are fire-and-forget so the UI never waits on storage — `setSettings`
 * is synchronous from the caller's perspective. We skip persisting on the
 * very first render (before hydration completes) so the defaults never
 * overwrite a stored value that's still loading.
 */
export function useCameraSettings(): UseCameraSettingsResult {
  const [settings, setSettingsState] = useState<CameraSettings>(DEFAULT_CAMERA_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    void loadCameraSettings().then((loaded) => {
      if (!mounted) return;
      setSettingsState(loaded);
      hydratedRef.current = true;
      setHydrated(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const setSettings = useCallback((patch: Partial<CameraSettings>) => {
    setSettingsState((prev) => {
      const next: CameraSettings = { ...prev, ...patch };
      if (hydratedRef.current) {
        void saveCameraSettings(next);
      }
      return next;
    });
  }, []);

  return { settings, setSettings, hydrated };
}
