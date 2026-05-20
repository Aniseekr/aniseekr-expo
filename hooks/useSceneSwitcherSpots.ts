import { useEffect, useReducer } from 'react';
import { pilgrimageRepository } from '../libs/services/pilgrimage/pilgrimage-repository';
import {
  INITIAL_SCENE_SWITCHER_SPOTS,
  sceneSwitcherSpotsReducer,
  type SceneSwitcherSpotsState,
} from '../libs/services/pilgrimage/scene-switcher-spots-state';

export type UseSceneSwitcherSpotsResult = SceneSwitcherSpotsState;

/**
 * Lazily loads the full point list for the camera screen's scene switcher.
 *
 * The fetch runs the first time the switcher opens (the repository has
 * in-memory + SQLite caches, so this is near-instant when the user arrived
 * from the anime detail page). CLAUDE.md Rule 8: on failure / unknown animeId
 * the result is an explicit empty array so the sheet renders an honest
 * "Unavailable" state — never a fake placeholder.
 *
 * Extracted from `compare/[spotId].tsx` so the route file no longer owns the
 * `availableSpots` / `spotsLoading` pair plus their two effects (Rule 9).
 */
export function useSceneSwitcherSpots(
  animeId: string | undefined,
  open: boolean
): UseSceneSwitcherSpotsResult {
  const [state, dispatch] = useReducer(sceneSwitcherSpotsReducer, INITIAL_SCENE_SWITCHER_SPOTS);
  const { spots } = state;

  // Reset the cached list whenever the anime context changes, so opening the
  // switcher refetches against the new animeId instead of showing stale spots.
  useEffect(() => {
    dispatch({ type: 'reset' });
  }, [animeId]);

  // NOTE: `loading` is deliberately NOT in the deps. Including it would cause
  // the effect to re-run when we flip it to `true`, the cleanup would cancel
  // the in-flight fetch, and the data would never land.
  useEffect(() => {
    if (!open) {
      dispatch({ type: 'closed' });
      return;
    }
    if (spots != null) return;
    const bangumiId = Number(animeId);
    if (!Number.isFinite(bangumiId) || bangumiId <= 0) {
      dispatch({ type: 'invalid' });
      return;
    }
    let cancelled = false;
    dispatch({ type: 'loading' });
    (async () => {
      try {
        const detailed = await pilgrimageRepository.getDetailedPointsByBangumiId(bangumiId);
        if (cancelled) return;
        if (detailed && detailed.length > 0) {
          dispatch({ type: 'loaded', spots: detailed });
          return;
        }
        // Detailed returned nothing — fall back to the lite payload so the
        // user at least sees the headline scenes.
        const lite = await pilgrimageRepository.getSpotsByBangumiId(bangumiId);
        if (cancelled) return;
        dispatch({ type: 'loaded', spots: lite?.litePoints ?? [] });
      } catch {
        if (cancelled) return;
        dispatch({ type: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, spots, animeId]);

  return state;
}
