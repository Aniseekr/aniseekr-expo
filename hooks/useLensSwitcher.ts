// Maps Apple AVFoundation lens names (`builtIn{UltraWide,WideAngle,Telephoto}Camera`)
// to FocalStop values. Provides REAL optical lens switching on iOS via expo-camera
// v17's `getAvailableLensesAsync()` + `selectedLens` prop on CameraView.
//
// Android has no equivalent API — `getAvailableLensesAsync()` is iOS-only and will
// throw on Android. We swallow that error and return empty arrays so the caller
// can fall back to digital `useCameraZoom`. Honors CLAUDE.md Rule 8: we do NOT
// optimistically populate availableStops with [0.5, 1, 2, 3] to look pretty —
// the pill row reflects the device's truth.
//
// telephotoStop defaults to 3 (matches iPhone 13/14/15/16 Pro). Older Pro devices
// (iPhone 11/12 Pro) wire their telephoto to 2x optical — pass `telephotoStop: 2`
// if targeting those. We use SINGLE physical lens names (not the virtual
// `builtInDual/TripleCamera` wrappers) so lens switching is predictable.
import type { CameraView } from 'expo-camera';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { FocalStop } from '../components/pilgrimage/camera/types';
import {
  isVirtualLens,
  lensForFocalStop,
  stopsForAvailableLenses,
  virtualLensesFromAvailable,
  type TelephotoStop,
} from '../libs/services/pilgrimage/lens-switching';

export interface UseLensSwitcherInput {
  cameraRef: RefObject<CameraView | null>;
  /** Default: 3 — iPhone 13+ Pro maps 3x to telephoto. Set to 2 for iPhone 11/12 Pro. */
  telephotoStop?: TelephotoStop;
}

export interface UseLensSwitcherOutput {
  /** Lens names available on this device (iOS only; empty on Android or before query resolves). */
  availableLenses: string[];
  /** Subset of FocalStops that map to a real physical lens on this device, sorted ascending. */
  availableStops: FocalStop[];
  /** Currently selected lens name (or null if not set / not iOS). */
  selectedLens: string | null;
  /** Switch to the lens for a given FocalStop. No-op if that stop isn't available. */
  setStop: (stop: FocalStop) => void;
  /** true if any physical lens switching is supported (≥2 distinct physical lenses). */
  hasOpticalZoom: boolean;
  /** Re-query lenses after CameraView reports ready; initial render usually has a null ref. */
  refreshAvailableLenses: () => Promise<void>;
  /**
   * Virtual / multi-lens auto-switching cameras the device exposes (subset of
   * `availableLenses` matching `builtInDual/DualWide/TripleCamera`). Empty on
   * non-Pro hardware and Android. Per Rule 8 — only echoes real values.
   */
  virtualLenses: string[];
  /**
   * Switch the active lens to a virtual auto-switching camera, or clear it by
   * passing `null`. No-op if the requested lens isn't in `virtualLenses`.
   */
  setVirtualLens: (lensName: string | null) => void;
  /** True iff `selectedLens` currently points at a virtual auto-switching lens. */
  isVirtualLensActive: boolean;
}

export function useLensSwitcher(input: UseLensSwitcherInput): UseLensSwitcherOutput {
  const { cameraRef, telephotoStop = 3 } = input;

  const [availableLenses, setAvailableLenses] = useState<string[]>([]);
  const [selectedLens, setSelectedLens] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshAvailableLenses = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera || typeof camera.getAvailableLensesAsync !== 'function') {
      if (mountedRef.current) setAvailableLenses([]);
      return;
    }
    try {
      const lenses = await camera.getAvailableLensesAsync();
      if (!mountedRef.current) return;
      setAvailableLenses(Array.isArray(lenses) ? lenses : []);
    } catch {
      if (mountedRef.current) setAvailableLenses([]);
    }
  }, [cameraRef]);

  // Query device lenses once on mount. The camera ref is often still null here,
  // so callers should also wire refreshAvailableLenses to CameraView.onCameraReady.
  // getAvailableLensesAsync is iOS-only and throws on Android — we catch and
  // leave availableLenses as []. We do NOT fall back to a fake default list.
  useEffect(() => {
    void refreshAvailableLenses();
  }, [refreshAvailableLenses]);

  const availableStops = stopsForAvailableLenses(availableLenses, telephotoStop) as FocalStop[];

  const setStop = useCallback(
    (stop: FocalStop) => {
      const lens = lensForFocalStop(stop, availableLenses, telephotoStop);
      if (!lens) return;
      setSelectedLens(lens);
    },
    [availableLenses, telephotoStop]
  );

  // Memoized so the array identity stays stable across renders that don't
  // actually change `availableLenses` — keeps consumers' useEffect deps quiet.
  const virtualLenses = useMemo(
    () => virtualLensesFromAvailable(availableLenses),
    [availableLenses]
  );

  const setVirtualLens = useCallback(
    (lensName: string | null) => {
      if (lensName === null) {
        setSelectedLens(null);
        return;
      }
      // Per Rule 8: refuse to set a virtual lens the device hasn't reported.
      if (!virtualLenses.includes(lensName)) return;
      setSelectedLens(lensName);
    },
    [virtualLenses]
  );

  const isVirtualLensActive = isVirtualLens(selectedLens);

  const hasOpticalZoom = availableStops.length >= 2;

  return {
    availableLenses,
    availableStops,
    selectedLens,
    setStop,
    hasOpticalZoom,
    refreshAvailableLenses,
    virtualLenses,
    setVirtualLens,
    isVirtualLensActive,
  };
}
