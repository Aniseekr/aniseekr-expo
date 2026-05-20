// usePilgrimageSpotSheet — owns the spot-sheet & cluster-picker state plus
// the nine derived `activeSpot*` values that used to be recomputed each
// route render. These flowed through `<SpotSheet>` props every time the
// route's root re-rendered (visited tap, search, etc.); centralising them
// here lets the route only re-render when the sheet's *visible* state
// actually changed.

import { useCallback, useMemo, useState } from 'react';
import * as Haptics from 'expo-haptics';
import {
  getInitialSpotSheetScene,
  getSpotSheetVisitedTarget,
  resolveSpotSheetSceneStack,
} from '../libs/services/pilgrimage/pilgrimage-detail-flow';
import type { SpotIntentKind, SpotIntentMap } from '../libs/services/pilgrimage/spot-intents';
import type { AnitabiPoint, AnitabiSpot } from '../libs/services/pilgrimage/types';
import type { PilgrimageCapture } from '../libs/services/pilgrimage/captures';
import type { VisitedMap } from '../libs/services/pilgrimage/visited-prefs';

export interface UsePilgrimageSpotSheetArgs {
  groupedSpotByPointId: Map<string, AnitabiSpot>;
  visited: VisitedMap;
  captures: Record<string, PilgrimageCapture>;
  spotIntents: SpotIntentMap;
  distanceFor: (spot: AnitabiPoint) => number | null;
}

export interface UsePilgrimageSpotSheetResult {
  activeSpot: AnitabiPoint | null;
  clusterSpots: readonly AnitabiPoint[] | null;
  selectedSpotId: string | null;
  setSelectedSpotId: React.Dispatch<React.SetStateAction<string | null>>;
  openGroup: (group: AnitabiSpot) => void;
  openSpot: (spot: AnitabiPoint) => void;
  openCluster: (spots: readonly AnitabiPoint[]) => void;
  closeSheet: () => void;
  closeCluster: () => void;
  pickFromCluster: (spot: AnitabiPoint) => void;
  // Memoized derived values consumed by <SpotSheet />.
  activeSpotGroup: AnitabiSpot | null;
  activeSpotScenes: readonly AnitabiPoint[];
  activeSpotVisitedTarget: AnitabiPoint | null;
  activeSpotVisited: boolean;
  activeSpotSaved: boolean;
  activeSpotPlanned: boolean;
  activeSpotDistance: number | null;
  activeSpotHasCapture: boolean;
  activeSpotSceneCount: number;
}

export function usePilgrimageSpotSheet({
  groupedSpotByPointId,
  visited,
  captures,
  spotIntents,
  distanceFor,
}: UsePilgrimageSpotSheetArgs): UsePilgrimageSpotSheetResult {
  const [activeSpot, setActiveSpot] = useState<AnitabiPoint | null>(null);
  const [clusterSpots, setClusterSpots] = useState<readonly AnitabiPoint[] | null>(null);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);

  const openGroup = useCallback((group: AnitabiSpot) => {
    Haptics.selectionAsync().catch(() => undefined);
    const initialScene = getInitialSpotSheetScene(group);
    if (initialScene) setActiveSpot(initialScene);
  }, []);

  const openSpot = useCallback((spot: AnitabiPoint) => {
    Haptics.selectionAsync().catch(() => undefined);
    setSelectedSpotId(spot.id);
    setActiveSpot(spot);
  }, []);

  const openCluster = useCallback((spots: readonly AnitabiPoint[]) => {
    Haptics.selectionAsync().catch(() => undefined);
    setClusterSpots(spots);
  }, []);

  const closeSheet = useCallback(() => setActiveSpot(null), []);
  const closeCluster = useCallback(() => setClusterSpots(null), []);

  const pickFromCluster = useCallback((spot: AnitabiPoint) => {
    Haptics.selectionAsync().catch(() => undefined);
    setClusterSpots(null);
    setActiveSpot(spot);
  }, []);

  const activeSpotGroup = useMemo(
    () => (activeSpot ? (groupedSpotByPointId.get(activeSpot.id) ?? null) : null),
    [activeSpot, groupedSpotByPointId]
  );
  const activeSpotScenes = useMemo(
    () => resolveSpotSheetSceneStack(activeSpot, activeSpotGroup),
    [activeSpot, activeSpotGroup]
  );
  const activeSpotVisitedTarget = useMemo(
    () => getSpotSheetVisitedTarget(activeSpot, activeSpotScenes),
    [activeSpot, activeSpotScenes]
  );
  const activeSpotVisited = useMemo(
    () =>
      activeSpotVisitedTarget ? visited[activeSpotVisitedTarget.id] === true : false,
    [activeSpotVisitedTarget, visited]
  );
  const activeSpotSaved = useMemo<boolean>(() => {
    if (!activeSpot) return false;
    const group = groupedSpotByPointId.get(activeSpot.id);
    return _hasIntent(activeSpot, 'saved', group, spotIntents);
  }, [activeSpot, groupedSpotByPointId, spotIntents]);
  const activeSpotPlanned = useMemo<boolean>(() => {
    if (!activeSpot) return false;
    const group = groupedSpotByPointId.get(activeSpot.id);
    return _hasIntent(activeSpot, 'planned', group, spotIntents);
  }, [activeSpot, groupedSpotByPointId, spotIntents]);
  const activeSpotDistance = useMemo<number | null>(
    () => (activeSpot ? distanceFor(activeSpot) : null),
    [activeSpot, distanceFor]
  );
  const activeSpotHasCapture = useMemo<boolean>(
    () => (activeSpot ? !!captures[activeSpot.id] : false),
    [activeSpot, captures]
  );
  const activeSpotSceneCount = activeSpotScenes.length;

  return {
    activeSpot,
    clusterSpots,
    selectedSpotId,
    setSelectedSpotId,
    openGroup,
    openSpot,
    openCluster,
    closeSheet,
    closeCluster,
    pickFromCluster,
    activeSpotGroup,
    activeSpotScenes,
    activeSpotVisitedTarget,
    activeSpotVisited,
    activeSpotSaved,
    activeSpotPlanned,
    activeSpotDistance,
    activeSpotHasCapture,
    activeSpotSceneCount,
  };
}

function _hasIntent(
  spot: AnitabiPoint,
  intent: SpotIntentKind,
  group: AnitabiSpot | undefined,
  spotIntents: SpotIntentMap
): boolean {
  if (group) return group.scenes.some((p) => spotIntents[p.id]?.[intent] === true);
  return spotIntents[spot.id]?.[intent] === true;
}
