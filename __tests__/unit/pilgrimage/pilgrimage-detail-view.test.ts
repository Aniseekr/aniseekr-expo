import { describe, expect, it } from 'bun:test';
import {
  pilgrimageDetailViewReducer,
  INITIAL_PILGRIMAGE_DETAIL_VIEW,
  type PilgrimageDetailViewState,
} from '../../../hooks/usePilgrimageDetailView';

describe('pilgrimageDetailViewReducer', () => {
  it('seeds sensible view defaults', () => {
    expect(INITIAL_PILGRIMAGE_DETAIL_VIEW.seriesSelection).toBe('all');
    expect(INITIAL_PILGRIMAGE_DETAIL_VIEW.viewMode).toBe('list');
    expect(INITIAL_PILGRIMAGE_DETAIL_VIEW.listLayout).toBe('grid');
    expect(INITIAL_PILGRIMAGE_DETAIL_VIEW.mapMarkerMode).toBe('photo');
    expect(INITIAL_PILGRIMAGE_DETAIL_VIEW.spotFilter).toBe('all');
    expect(INITIAL_PILGRIMAGE_DETAIL_VIEW.spotSearchQuery).toBe('');
  });

  it('merges an object patch over the current state', () => {
    const next = pilgrimageDetailViewReducer(INITIAL_PILGRIMAGE_DETAIL_VIEW, {
      spotFilter: 'visited',
      spotSearchQuery: 'kyoto',
    });
    expect(next.spotFilter).toBe('visited');
    expect(next.spotSearchQuery).toBe('kyoto');
    // Untouched fields are preserved.
    expect(next.viewMode).toBe('list');
  });

  it('switches view + layout together (preset change)', () => {
    const next = pilgrimageDetailViewReducer(INITIAL_PILGRIMAGE_DETAIL_VIEW, {
      viewMode: 'map',
      listLayout: 'rows',
    });
    expect(next.viewMode).toBe('map');
    expect(next.listLayout).toBe('rows');
  });

  it('applies a functional patch against the live state (marker / offline toggles)', () => {
    const dotted = pilgrimageDetailViewReducer(INITIAL_PILGRIMAGE_DETAIL_VIEW, (v) => ({
      mapMarkerMode: v.mapMarkerMode === 'photo' ? 'dot' : 'photo',
    }));
    expect(dotted.mapMarkerMode).toBe('dot');
    const offline = pilgrimageDetailViewReducer(dotted, (v) => ({
      mapOfflineOnly: !v.mapOfflineOnly,
    }));
    expect(offline.mapOfflineOnly).toBe(true);
  });

  it('does not mutate the previous state object', () => {
    const before: PilgrimageDetailViewState = { ...INITIAL_PILGRIMAGE_DETAIL_VIEW };
    const next = pilgrimageDetailViewReducer(before, { seriesSelection: 'all' });
    expect(next).not.toBe(before);
    expect(before.spotSearchQuery).toBe('');
  });
});
