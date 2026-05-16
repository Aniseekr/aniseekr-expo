import { describe, expect, it } from 'bun:test';
import { shouldReseedZoomState } from '../../../libs/services/pilgrimage/camera-zoom-state';

describe('camera zoom state helpers', () => {
  it('reseeds when the current zoom is still at the previous initial stop', () => {
    expect(shouldReseedZoomState({ currentZoom: 0, previousInitialZoom: 0 })).toBe(true);
    expect(shouldReseedZoomState({ currentZoom: 0.25000001, previousInitialZoom: 0.25 })).toBe(
      true
    );
  });

  it('preserves hand-set zoom when native capability refreshes change the stop map', () => {
    expect(shouldReseedZoomState({ currentZoom: 0.42, previousInitialZoom: 0 })).toBe(false);
  });

  it('reseeds invalid current zoom values to recover safely', () => {
    expect(shouldReseedZoomState({ currentZoom: Number.NaN, previousInitialZoom: 0 })).toBe(true);
    expect(shouldReseedZoomState({ currentZoom: Infinity, previousInitialZoom: 0 })).toBe(true);
  });
});
