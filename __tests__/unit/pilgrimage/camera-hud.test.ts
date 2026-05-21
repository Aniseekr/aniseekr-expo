import { describe, expect, it } from 'bun:test';
import {
  cameraHudReducer,
  INITIAL_CAMERA_HUD,
  type CameraHudState,
} from '../../../hooks/useCameraHud';

describe('cameraHudReducer', () => {
  it('seeds sensible HUD defaults', () => {
    expect(INITIAL_CAMERA_HUD.facing).toBe('back');
    // Default flipped to 'edge' because the anime bitmap overlay fully
    // covers the live preview at the default opacity — newcomers couldn't
    // see the camera. Persisted overlayMode (in CameraSettings) restores
    // the user's actual pick on subsequent launches.
    expect(INITIAL_CAMERA_HUD.overlayMode).toBe('edge');
    expect(INITIAL_CAMERA_HUD.overlayVisible).toBe(true);
    expect(INITIAL_CAMERA_HUD.quickControlsOpen).toBe(true);
    expect(INITIAL_CAMERA_HUD.captureModeToast).toBeNull();
  });

  it('merges an object patch over the current state', () => {
    const next = cameraHudReducer(INITIAL_CAMERA_HUD, { aspect: 'full', evValue: 1.5 });
    expect(next.aspect).toBe('full');
    expect(next.evValue).toBe(1.5);
    // Untouched fields are preserved.
    expect(next.facing).toBe('back');
  });

  it('applies a functional patch against the live state (toggles, cycles)', () => {
    const opened = cameraHudReducer(INITIAL_CAMERA_HUD, (h) => ({
      editMode: !h.editMode,
    }));
    expect(opened.editMode).toBe(true);
    const closed = cameraHudReducer(opened, (h) => ({ editMode: !h.editMode }));
    expect(closed.editMode).toBe(false);
  });

  it('does not mutate the previous state object', () => {
    const before: CameraHudState = { ...INITIAL_CAMERA_HUD };
    const next = cameraHudReducer(before, { settingsOpen: true });
    expect(next).not.toBe(before);
    expect(before.settingsOpen).toBe(false);
    expect(next.settingsOpen).toBe(true);
  });

  it('lets one patch update several related fields at once', () => {
    const next = cameraHudReducer(INITIAL_CAMERA_HUD, {
      overlayMode: 'edge',
      overlayVisible: true,
      switchToast: { icon: 'analytics-outline', label: 'Edge' },
    });
    expect(next.overlayMode).toBe('edge');
    expect(next.switchToast?.label).toBe('Edge');
  });
});
