import { useReducer } from 'react';
import type { CameraOrientationMode } from '../libs/services/pilgrimage/camera-ui';
import type { EdgeIntensity } from '../libs/services/pilgrimage/edge-overlay';
import type { SubjectFocus } from '../libs/services/pilgrimage/subject-overlay';
import type {
  AspectRatio,
  CameraFacing,
  FlashMode,
  OverlayMode,
} from '../components/pilgrimage/camera/types';
import type { CaptureModeToastValue } from '../components/pilgrimage/camera/CaptureModeToast';
import type { AutoCaptureToastValue } from '../components/pilgrimage/camera/AutoCaptureToast';
import type { CamSwitchToastValue } from '../components/pilgrimage/camera/CamSwitchToast';

/**
 * Every piece of camera-screen HUD interaction state, in one place.
 *
 * CLAUDE.md Rule 9: the camera capture screen must not be a state dumping
 * ground. Previously `compare/[spotId].tsx` declared ~19 separate top-level
 * `useState`s for these knobs. They are all driven by user taps (never at
 * sensor/gesture frequency), so a single reducer is the right owner — the
 * route file consumes one `{ hud, setHud }` pair instead.
 *
 * Persisted settings (capture mode, countdown, quality) live in
 * `useCameraSettings`; high-frequency values (zoom, tilt, focus) stay on
 * Reanimated `SharedValue`s. This hook is strictly the discrete HUD state.
 */
export interface CameraHudState {
  // --- Camera capture controls ---
  facing: CameraFacing;
  flashMode: FlashMode;
  aspect: AspectRatio;
  /** Exposure-compensation value the focus/EV bar drives. */
  evValue: number;
  orientationMode: CameraOrientationMode;

  // --- Overlay configuration ---
  overlayMode: OverlayMode;
  /** Off-segment toggle — when false the overlay renders at 0 opacity. */
  overlayVisible: boolean;
  overlayOpacity: number;
  /** Reposition (drag/scale/rotate) mode for the overlay transform. */
  editMode: boolean;
  edgeIntensity: EdgeIntensity;
  subjectFocus: SubjectFocus;
  subjectCombine: boolean;

  // --- HUD panels ---
  settingsOpen: boolean;
  quickControlsOpen: boolean;
  overlayDockOpen: boolean;
  sceneSwitcherOpen: boolean;

  // --- Transient toasts (set-only; the toast components self-dismiss) ---
  captureModeToast: CaptureModeToastValue | null;
  autoCaptureToast: AutoCaptureToastValue | null;
  switchToast: CamSwitchToastValue | null;
}

export const INITIAL_CAMERA_HUD: CameraHudState = {
  facing: 'back',
  flashMode: 'off',
  aspect: '16:9',
  evValue: 0,
  orientationMode: 'auto',

  overlayMode: 'anime',
  overlayVisible: true,
  overlayOpacity: 0.35,
  editMode: false,
  edgeIntensity: 'low',
  subjectFocus: 'normal',
  subjectCombine: false,

  settingsOpen: false,
  quickControlsOpen: true,
  overlayDockOpen: true,
  sceneSwitcherOpen: false,

  captureModeToast: null,
  autoCaptureToast: null,
  switchToast: null,
};

/**
 * A patch applied to the HUD state — either a partial object, or a function of
 * the current state (use the functional form for toggles and cycles so they
 * never read a stale render-closure value).
 */
export type CameraHudPatch =
  | Partial<CameraHudState>
  | ((state: CameraHudState) => Partial<CameraHudState>);

export function cameraHudReducer(state: CameraHudState, patch: CameraHudPatch): CameraHudState {
  const next = typeof patch === 'function' ? patch(state) : patch;
  return { ...state, ...next };
}

export interface UseCameraHudResult {
  hud: CameraHudState;
  /** Merge a patch into the HUD state. Stable across renders. */
  setHud: (patch: CameraHudPatch) => void;
}

/**
 * Owns the camera screen's discrete HUD state behind a small `{ hud, setHud }`
 * API. `setHud` is the reducer dispatch, so it is referentially stable and
 * safe to omit from / include in `useCallback` dependency arrays.
 */
export function useCameraHud(): UseCameraHudResult {
  const [hud, setHud] = useReducer(cameraHudReducer, INITIAL_CAMERA_HUD);
  return { hud, setHud };
}
