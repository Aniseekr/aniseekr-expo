import { useReducer } from 'react';
import type { PilgrimageSpotFilter } from '../libs/services/pilgrimage/pilgrimage-detail-filter';
import type {
  PilgrimageDetailListLayout,
  PilgrimageDetailViewMode,
} from '../libs/services/pilgrimage/pilgrimage-detail-flow';
import type { PilgrimageSeriesSelection } from '../libs/services/pilgrimage/pilgrimage-series';

/** Map marker rendering style on the pilgrimage detail map. */
export type MapMarkerMode = 'photo' | 'dot';

/**
 * The pilgrimage detail screen's view/filter control state, in one place.
 *
 * CLAUDE.md Rule 9: `[animeId].tsx` should not own every UI control as a loose
 * top-level `useState`. These seven knobs are a cohesive group — "how the user
 * is currently viewing and filtering the spot list" — driven entirely by taps,
 * so a single reducer is the right owner. Selection state, location, and the
 * persisted visited/intent/capture maps stay separate; they are different
 * concerns with their own lifecycles.
 */
export interface PilgrimageDetailViewState {
  seriesSelection: PilgrimageSeriesSelection;
  viewMode: PilgrimageDetailViewMode;
  listLayout: PilgrimageDetailListLayout;
  mapMarkerMode: MapMarkerMode;
  mapOfflineOnly: boolean;
  spotFilter: PilgrimageSpotFilter;
  spotSearchQuery: string;
}

export const INITIAL_PILGRIMAGE_DETAIL_VIEW: PilgrimageDetailViewState = {
  seriesSelection: 'all',
  viewMode: 'list',
  listLayout: 'grid',
  mapMarkerMode: 'photo',
  mapOfflineOnly: false,
  spotFilter: 'all',
  spotSearchQuery: '',
};

/**
 * A patch applied to the view state — a partial object, or a function of the
 * current state (use the functional form for toggles so they never read a
 * stale render-closure value).
 */
export type PilgrimageDetailViewPatch =
  | Partial<PilgrimageDetailViewState>
  | ((state: PilgrimageDetailViewState) => Partial<PilgrimageDetailViewState>);

export function pilgrimageDetailViewReducer(
  state: PilgrimageDetailViewState,
  patch: PilgrimageDetailViewPatch
): PilgrimageDetailViewState {
  const next = typeof patch === 'function' ? patch(state) : patch;
  return { ...state, ...next };
}

export interface UsePilgrimageDetailViewResult {
  view: PilgrimageDetailViewState;
  /** Merge a patch into the view state. Stable across renders. */
  setView: (patch: PilgrimageDetailViewPatch) => void;
}

/**
 * Owns the pilgrimage detail screen's view/filter controls behind a small
 * `{ view, setView }` API. `setView` is the reducer dispatch, so it is
 * referentially stable.
 */
export function usePilgrimageDetailView(): UsePilgrimageDetailViewResult {
  const [view, setView] = useReducer(pilgrimageDetailViewReducer, INITIAL_PILGRIMAGE_DETAIL_VIEW);
  return { view, setView };
}
