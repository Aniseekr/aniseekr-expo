// usePilgrimageDerivedSpots — the long memoization chain that turns raw
// `points` into grouped, sorted, searched, filtered slices, plus the helpers
// that compute distance / intent / capture state per spot.
//
// Phase 4 splits the legacy `stats` memo into two so flipping `visited` no
// longer reruns the N-haversine `radiusKm` computation. `filteredPoints` is
// now derived from `filteredGroupedSpots` (one filter chain, not two).

import { useCallback, useMemo } from 'react';
import { groupPointsIntoSpots } from '../libs/services/pilgrimage/anitabi-points';
import { hasValidGeo } from '../components/pilgrimage/detail/_helpers';
import { locationService, type LatLng } from '../libs/services/pilgrimage/location-service';
import {
  countPilgrimageSpotFilters,
  filterPilgrimageSpots,
  normalizePilgrimageSearchQuery,
  sortPilgrimageSpotsByIntent,
  type PilgrimageSpotFilter,
} from '../libs/services/pilgrimage/pilgrimage-detail-filter';
import {
  getNearestSceneForSpot,
  getSpotDistanceKm,
  sortSpotsByDistance,
} from '../libs/services/pilgrimage/spot-distance-sort';
import type { SpotIntentMap } from '../libs/services/pilgrimage/spot-intents';
import type { AnitabiBangumi, AnitabiPoint, AnitabiSpot } from '../libs/services/pilgrimage/types';
import type { PilgrimageCapture } from '../libs/services/pilgrimage/captures';
import type { VisitedMap } from '../libs/services/pilgrimage/visited-prefs';

export interface SpotStats {
  spotCount: number;
  radiusKm: number;
}
export interface UserSpotStats {
  visitedCount: number;
  capturedCount: number;
}

export interface UsePilgrimageDerivedSpotsResult {
  groupedSpots: readonly AnitabiSpot[];
  groupedSpotByPointId: Map<string, AnitabiSpot>;
  filteredGroupedSpots: readonly AnitabiSpot[];
  filteredPoints: readonly AnitabiPoint[];
  filteredPointIds: Set<string>;
  filteredMappablePointCount: number;
  groupedCounts: ReturnType<typeof countPilgrimageSpotFilters>;
  normalizedSpotSearchQuery: string;
  fallbackSelectedSpotId: string | null;
  spotStats: SpotStats;
  userStats: UserSpotStats;
  distanceFor: (spot: AnitabiPoint) => number | null;
  distanceForGroup: (group: AnitabiSpot) => number | null;
  representativeForGroup: (group: AnitabiSpot) => AnitabiPoint;
}

export interface UsePilgrimageDerivedSpotsArgs {
  anime: AnitabiBangumi | null;
  points: readonly AnitabiPoint[];
  userLocation: LatLng | null;
  visited: VisitedMap;
  captures: Record<string, PilgrimageCapture>;
  spotIntents: SpotIntentMap;
  spotFilter: PilgrimageSpotFilter;
  spotSearchQuery: string;
  viewMode: 'list' | 'map';
}

export function usePilgrimageDerivedSpots({
  anime,
  points,
  userLocation,
  visited,
  captures,
  spotIntents,
  spotFilter,
  spotSearchQuery,
  viewMode,
}: UsePilgrimageDerivedSpotsArgs): UsePilgrimageDerivedSpotsResult {
  // Phase 4: spotStats only depends on the immutable side (anime + points).
  // Toggling visited / capturing a photo no longer reruns N haversines.
  const spotStats = useMemo<SpotStats>(() => {
    const spotCount = anime?.pointsLength ?? points.length;
    let radiusKm = 0;
    if (anime && hasValidGeo(anime.geo)) {
      const [centerLat, centerLng] = anime.geo;
      let max = 0;
      for (const p of points) {
        if (!hasValidGeo(p.geo)) continue;
        const d = locationService.getDistanceKm(
          { latitude: centerLat, longitude: centerLng },
          { latitude: p.geo[0], longitude: p.geo[1] }
        );
        if (Number.isFinite(d) && d > max) max = d;
      }
      radiusKm = max;
    }
    return { spotCount, radiusKm };
  }, [anime, points]);

  const userStats = useMemo<UserSpotStats>(() => {
    let visitedCount = 0;
    let capturedCount = 0;
    for (const p of points) {
      if (visited[p.id]) visitedCount += 1;
      if (captures[p.id]) capturedCount += 1;
    }
    return { visitedCount, capturedCount };
  }, [points, visited, captures]);

  const groupedSpots = useMemo(() => groupPointsIntoSpots(points), [points]);

  const groupedSpotByPointId = useMemo(() => {
    const map = new Map<string, AnitabiSpot>();
    for (const spot of groupedSpots) {
      for (const scene of spot.scenes) map.set(scene.id, spot);
    }
    return map;
  }, [groupedSpots]);

  const distanceSortedGroupedSpots = useMemo(
    () => sortSpotsByDistance(groupedSpots, userLocation),
    [groupedSpots, userLocation]
  );

  const sortedGroupedSpots = useMemo(
    () => sortPilgrimageSpotsByIntent(distanceSortedGroupedSpots, spotIntents),
    [distanceSortedGroupedSpots, spotIntents]
  );

  const normalizedSpotSearchQuery = useMemo(
    () => normalizePilgrimageSearchQuery(spotSearchQuery),
    [spotSearchQuery]
  );

  const searchedGroupedSpots = useMemo(
    () => filterPilgrimageSpots(sortedGroupedSpots, { query: spotSearchQuery }),
    [sortedGroupedSpots, spotSearchQuery]
  );

  const filteredGroupedSpots = useMemo(
    () =>
      filterPilgrimageSpots(searchedGroupedSpots, {
        filter: spotFilter,
        visited,
        captures,
        intents: spotIntents,
      }),
    [searchedGroupedSpots, spotFilter, visited, captures, spotIntents]
  );

  // Phase 4: derive `filteredPoints` from `filteredGroupedSpots` instead of
  // running a second filter chain over `points`. They are by construction the
  // same set of scenes.
  const filteredPoints = useMemo<readonly AnitabiPoint[]>(() => {
    const out: AnitabiPoint[] = [];
    for (const group of filteredGroupedSpots) {
      for (const scene of group.scenes) out.push(scene);
    }
    return out;
  }, [filteredGroupedSpots]);

  const filteredPointIds = useMemo(() => {
    const ids = new Set<string>();
    for (const point of filteredPoints) ids.add(point.id);
    return ids;
  }, [filteredPoints]);

  const filteredMappablePointCount = useMemo(
    () => filteredPoints.reduce((count, point) => count + (hasValidGeo(point.geo) ? 1 : 0), 0),
    [filteredPoints]
  );

  const groupedCounts = useMemo(
    () => countPilgrimageSpotFilters(searchedGroupedSpots, visited, captures, spotIntents),
    [searchedGroupedSpots, visited, captures, spotIntents]
  );

  const fallbackSelectedSpotId = useMemo(() => {
    if (viewMode !== 'map' || filteredGroupedSpots.length === 0) return null;
    const firstValid = filteredGroupedSpots
      .map((spot) => getNearestSceneForSpot(spot, userLocation))
      .find((point) => hasValidGeo(point.geo));
    return firstValid ? firstValid.id : null;
  }, [viewMode, filteredGroupedSpots, userLocation]);

  const distanceFor = useCallback(
    (spot: AnitabiPoint): number | null => {
      if (!userLocation || !hasValidGeo(spot.geo)) return null;
      const d = locationService.getDistanceKm(userLocation, {
        latitude: spot.geo[0],
        longitude: spot.geo[1],
      });
      return Number.isFinite(d) ? d : null;
    },
    [userLocation]
  );

  const distanceForGroup = useCallback(
    (group: AnitabiSpot): number | null => getSpotDistanceKm(group, userLocation),
    [userLocation]
  );

  const representativeForGroup = useCallback(
    (group: AnitabiSpot): AnitabiPoint => getNearestSceneForSpot(group, userLocation),
    [userLocation]
  );

  return {
    groupedSpots,
    groupedSpotByPointId,
    filteredGroupedSpots,
    filteredPoints,
    filteredPointIds,
    filteredMappablePointCount,
    groupedCounts,
    normalizedSpotSearchQuery,
    fallbackSelectedSpotId,
    spotStats,
    userStats,
    distanceFor,
    distanceForGroup,
    representativeForGroup,
  };
}
