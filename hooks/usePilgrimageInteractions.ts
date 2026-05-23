// usePilgrimageInteractions — owns the persisted user-interaction state for
// the pilgrimage detail screen: visited spots, save/plan intents, and the
// capture map. Returns stable handlers so leaf list items can stay memo'd.
//
// CLAUDE.md Rule 9: these three persisted maps + their handlers used to live
// as five loose `useState` + three `useEffect` at the top of
// `app/(tabs)/pilgrimage/[animeId].tsx`. Moving them into one feature hook
// shrinks the route shell and keeps the persistence policy in one file.

import { useCallback, useState } from 'react';
import * as Haptics from 'expo-haptics';
import {
  loadCapturesSync,
  type PilgrimageCapture,
} from '../libs/services/pilgrimage/captures';
import {
  loadSpotIntentsSync,
  saveSpotIntents,
  type SpotIntentKind,
  type SpotIntentMap,
} from '../libs/services/pilgrimage/spot-intents';
import {
  loadVisitedSpotsSync,
  saveVisitedSpots,
  type VisitedMap,
} from '../libs/services/pilgrimage/visited-prefs';
import type { AnitabiPoint, AnitabiSpot } from '../libs/services/pilgrimage/types';

export interface UsePilgrimageInteractionsResult {
  visited: VisitedMap;
  spotIntents: SpotIntentMap;
  captures: Record<string, PilgrimageCapture>;
  refreshCaptures: () => void;
  toggleVisitedPoint: (spot: AnitabiPoint) => void;
  /**
   * Toggle visited for every cut at this grouped location at once. Anitabi
   * returns one point per scene-cut, so a single shrine is often N near-
   * identical points; the UX treats them as one place.
   */
  toggleGroupedVisited: (group: AnitabiSpot) => void;
  /**
   * Toggle a `saved` or `planned` intent for every cut at this point's grouped
   * location. The lookup table mapping point-id → group is passed in so this
   * hook stays decoupled from the grouping pipeline.
   */
  toggleSpotIntent: (
    spot: AnitabiPoint,
    intent: SpotIntentKind,
    groupedSpotByPointId: Map<string, AnitabiSpot>
  ) => void;
  hasIntentForGroup: (group: AnitabiSpot, intent: SpotIntentKind) => boolean;
  hasIntentForPoint: (
    spot: AnitabiPoint,
    intent: SpotIntentKind,
    groupedSpotByPointId: Map<string, AnitabiSpot>
  ) => boolean;
}

export function usePilgrimageInteractions(): UsePilgrimageInteractionsResult {
  // Seed synchronously from MMKV so visited / save / plan / capture markers are
  // correct on the first frame instead of popping in after an async resolve.
  const [visited, setVisited] = useState<VisitedMap>(loadVisitedSpotsSync);
  const [spotIntents, setSpotIntents] = useState<SpotIntentMap>(loadSpotIntentsSync);
  const [captures, setCaptures] =
    useState<Record<string, PilgrimageCapture>>(loadCapturesSync);

  // The three pieces of state are seeded synchronously from MMKV above.
  // `refreshCaptures` is exposed so callers can re-pull after they record a
  // capture from the camera flow without re-mounting the hook.
  const refreshCaptures = useCallback(() => {
    setCaptures(loadCapturesSync());
  }, []);

  const toggleVisitedPoint = useCallback((spot: AnitabiPoint) => {
    Haptics.selectionAsync().catch(() => undefined);
    setVisited((prev) => {
      const next: VisitedMap = { ...prev };
      if (next[spot.id]) {
        delete next[spot.id];
      } else {
        next[spot.id] = true;
      }
      void saveVisitedSpots(next);
      return next;
    });
  }, []);

  const toggleGroupedVisited = useCallback((group: AnitabiSpot) => {
    Haptics.selectionAsync().catch(() => undefined);
    setVisited((prev) => {
      const anyVisited = group.scenes.some((p) => prev[p.id] === true);
      const next: VisitedMap = { ...prev };
      for (const p of group.scenes) {
        if (anyVisited) delete next[p.id];
        else next[p.id] = true;
      }
      void saveVisitedSpots(next);
      return next;
    });
  }, []);

  const toggleSpotIntent = useCallback(
    (
      spot: AnitabiPoint,
      intent: SpotIntentKind,
      groupedSpotByPointId: Map<string, AnitabiSpot>
    ) => {
      Haptics.selectionAsync().catch(() => undefined);
      const group = groupedSpotByPointId.get(spot.id);
      const ids = group ? group.scenes.map((p) => p.id) : [spot.id];
      setSpotIntents((prev) => {
        const shouldRemove = ids.some((id) => prev[id]?.[intent] === true);
        const next: SpotIntentMap = { ...prev };
        for (const id of ids) {
          const nextIntent = { ...(next[id] ?? {}) };
          if (shouldRemove) delete nextIntent[intent];
          else nextIntent[intent] = true;
          if (nextIntent.saved || nextIntent.planned) next[id] = nextIntent;
          else delete next[id];
        }
        void saveSpotIntents(next);
        return next;
      });
    },
    []
  );

  const hasIntentForGroup = useCallback(
    (group: AnitabiSpot, intent: SpotIntentKind): boolean =>
      group.scenes.some((point) => spotIntents[point.id]?.[intent] === true),
    [spotIntents]
  );

  const hasIntentForPoint = useCallback(
    (
      spot: AnitabiPoint,
      intent: SpotIntentKind,
      groupedSpotByPointId: Map<string, AnitabiSpot>
    ): boolean => {
      const group = groupedSpotByPointId.get(spot.id);
      if (group) return group.scenes.some((p) => spotIntents[p.id]?.[intent] === true);
      return spotIntents[spot.id]?.[intent] === true;
    },
    [spotIntents]
  );

  return {
    visited,
    spotIntents,
    captures,
    refreshCaptures,
    toggleVisitedPoint,
    toggleGroupedVisited,
    toggleSpotIntent,
    hasIntentForGroup,
    hasIntentForPoint,
  };
}
