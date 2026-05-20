// Pure equality functions for the memo'd pilgrimage detail components.
//
// These are split out of the component files so unit tests can import the
// comparisons without dragging in react-native / expo-image / reanimated. The
// component files re-export and wire them into `React.memo(..., areEqual)`.

import type { ThemePalette } from '../../../context/ThemeContext';
import type { AnitabiPoint, AnitabiSpot } from '../../../libs/services/pilgrimage/types';
import type { PilgrimageCapture } from '../../../libs/services/pilgrimage/captures';
import type { SpotIntentKind } from '../../../libs/services/pilgrimage/spot-intents';
import type { VisitedMap } from '../../../libs/services/pilgrimage/visited-prefs';
import type { Ionicons } from '@expo/vector-icons/build/Icons';
import type MaterialIcons from '@expo/vector-icons/MaterialIcons';

// ------------------------------------------------------------------------
// Common shape — every leaf takes the same theme palette + shared brand
// colors. Re-declared here so the equality file has zero JSX imports.
// ------------------------------------------------------------------------

interface ThemedProps {
  theme: ThemePalette;
  themeColor: string;
  themeColorFg: string;
}

// ------------------------------------------------------------------------
// SceneTile
// ------------------------------------------------------------------------

export interface SceneTileEqualityProps extends ThemedProps {
  spot: AnitabiPoint;
  sceneCount: number;
  distanceKm: number | null;
  visited: boolean;
  saved: boolean;
  planned: boolean;
  hasCapture: boolean;
  captureUri: string | null;
  onPress: (spot: AnitabiPoint) => void;
  onToggleVisited: (spot: AnitabiPoint) => void;
  onTakeComparison: (spot: AnitabiPoint) => void;
}

export function sceneTilePropsEqual(
  prev: SceneTileEqualityProps,
  next: SceneTileEqualityProps
): boolean {
  return (
    prev.spot.id === next.spot.id &&
    prev.spot.image === next.spot.image &&
    prev.spot.name === next.spot.name &&
    prev.sceneCount === next.sceneCount &&
    prev.themeColor === next.themeColor &&
    prev.themeColorFg === next.themeColorFg &&
    prev.distanceKm === next.distanceKm &&
    prev.visited === next.visited &&
    prev.saved === next.saved &&
    prev.planned === next.planned &&
    prev.hasCapture === next.hasCapture &&
    prev.captureUri === next.captureUri &&
    prev.theme === next.theme &&
    prev.onPress === next.onPress &&
    prev.onToggleVisited === next.onToggleVisited &&
    prev.onTakeComparison === next.onTakeComparison
  );
}

// ------------------------------------------------------------------------
// SpotRow
// ------------------------------------------------------------------------

export interface SpotRowEqualityProps extends ThemedProps {
  spot: AnitabiPoint;
  sceneCount: number;
  distanceKm: number | null;
  visited: boolean;
  saved: boolean;
  planned: boolean;
  hasCapture: boolean;
  captureUri: string | null;
  onPress: (spot: AnitabiPoint) => void;
  onToggleVisited: (spot: AnitabiPoint) => void;
  onOpenMaps: (spot: AnitabiPoint) => void;
}

export function spotRowPropsEqual(
  prev: SpotRowEqualityProps,
  next: SpotRowEqualityProps
): boolean {
  return (
    prev.spot.id === next.spot.id &&
    prev.spot.image === next.spot.image &&
    prev.spot.name === next.spot.name &&
    prev.sceneCount === next.sceneCount &&
    prev.themeColor === next.themeColor &&
    prev.themeColorFg === next.themeColorFg &&
    prev.distanceKm === next.distanceKm &&
    prev.visited === next.visited &&
    prev.saved === next.saved &&
    prev.planned === next.planned &&
    prev.hasCapture === next.hasCapture &&
    prev.captureUri === next.captureUri &&
    prev.theme === next.theme &&
    prev.onPress === next.onPress &&
    prev.onToggleVisited === next.onToggleVisited &&
    prev.onOpenMaps === next.onOpenMaps
  );
}

// ------------------------------------------------------------------------
// SpotChip
// ------------------------------------------------------------------------

export interface SpotChipEqualityProps extends ThemedProps {
  spot: AnitabiPoint;
  active: boolean;
  distanceKm: number | null;
  visited: boolean;
  saved: boolean;
  planned: boolean;
  hasCapture: boolean;
  onPress: (spot: AnitabiPoint) => void;
}

export function spotChipPropsEqual(
  prev: SpotChipEqualityProps,
  next: SpotChipEqualityProps
): boolean {
  return (
    prev.spot.id === next.spot.id &&
    prev.spot.ep === next.spot.ep &&
    prev.active === next.active &&
    prev.themeColor === next.themeColor &&
    prev.themeColorFg === next.themeColorFg &&
    prev.distanceKm === next.distanceKm &&
    prev.visited === next.visited &&
    prev.saved === next.saved &&
    prev.planned === next.planned &&
    prev.hasCapture === next.hasCapture &&
    prev.theme === next.theme &&
    prev.onPress === next.onPress
  );
}

// ------------------------------------------------------------------------
// FilterPill
// ------------------------------------------------------------------------

export interface FilterPillEqualityProps extends ThemedProps {
  label: string;
  active: boolean;
  badge: number;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
}

export function filterPillPropsEqual(
  prev: FilterPillEqualityProps,
  next: FilterPillEqualityProps
): boolean {
  return (
    prev.label === next.label &&
    prev.active === next.active &&
    prev.badge === next.badge &&
    prev.themeColor === next.themeColor &&
    prev.themeColorFg === next.themeColorFg &&
    prev.icon === next.icon &&
    prev.theme === next.theme &&
    prev.onPress === next.onPress
  );
}

// ------------------------------------------------------------------------
// SeriesSwitchChip
// ------------------------------------------------------------------------

export interface SeriesSwitchChipEqualityProps extends ThemedProps {
  label: string;
  sublabel: string;
  active: boolean;
  disabled: boolean;
  badge?: number;
  onPress: () => void;
}

export function seriesSwitchChipPropsEqual(
  prev: SeriesSwitchChipEqualityProps,
  next: SeriesSwitchChipEqualityProps
): boolean {
  return (
    prev.label === next.label &&
    prev.sublabel === next.sublabel &&
    prev.active === next.active &&
    prev.disabled === next.disabled &&
    prev.badge === next.badge &&
    prev.themeColor === next.themeColor &&
    prev.themeColorFg === next.themeColorFg &&
    prev.theme === next.theme &&
    prev.onPress === next.onPress
  );
}

// ------------------------------------------------------------------------
// StatCell
// ------------------------------------------------------------------------

export interface StatCellEqualityProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  value: string;
  label: string;
  color: string;
  theme: ThemePalette;
}

export function statCellPropsEqual(
  prev: StatCellEqualityProps,
  next: StatCellEqualityProps
): boolean {
  return (
    prev.icon === next.icon &&
    prev.value === next.value &&
    prev.label === next.label &&
    prev.color === next.color &&
    prev.theme === next.theme
  );
}

// ------------------------------------------------------------------------
// SpotMapView marker signature helpers (Phase 4 bridge optimization).
// Splitting these here lets us unit-test the structural-vs-visited split
// without spinning up a WebView.
// ------------------------------------------------------------------------

export interface MapMarkerStructural {
  id: string;
  ep: number;
  image: string;
  ringColor: string;
  markerMode: 'photo' | 'dot';
  visited: boolean;
}

/**
 * The structural signature for the marker payload. Re-sending the heavy
 * `__updateMarkers` JSON is only required when this changes; a visited-only
 * change uses the lighter `__updateVisited(ids)` path.
 */
export function computeMarkerStructuralSignature(
  markers: readonly MapMarkerStructural[]
): string {
  let sig = '';
  for (const m of markers) {
    sig += `${m.id}|${m.ep}|${m.image}|${m.markerMode}|${m.ringColor};`;
  }
  return sig;
}

/**
 * The sorted, comma-joined list of currently-visited marker ids. Used as a
 * dep so the visited bridge fires only when the set actually changes.
 */
export function computeVisitedIdsKey(markers: readonly MapMarkerStructural[]): string {
  const ids: string[] = [];
  for (const m of markers) if (m.visited) ids.push(m.id);
  ids.sort();
  return ids.join(',');
}

// ------------------------------------------------------------------------
// usePilgrimageInteractions: pure intent-resolution helper.
// ------------------------------------------------------------------------

export interface HasIntentArgs {
  spot: AnitabiPoint;
  intent: SpotIntentKind;
  group: AnitabiSpot | undefined;
  spotIntents: Readonly<Record<string, Partial<Record<SpotIntentKind, boolean>>>>;
}

export function hasIntentForSpot({ spot, intent, group, spotIntents }: HasIntentArgs): boolean {
  if (group) {
    return group.scenes.some((p) => spotIntents[p.id]?.[intent] === true);
  }
  return spotIntents[spot.id]?.[intent] === true;
}

// ------------------------------------------------------------------------
// Tiny helpers that may grow into more pure pipelines.
// ------------------------------------------------------------------------

export function flattenScenesFromGroups(groups: readonly AnitabiSpot[]): AnitabiPoint[] {
  const out: AnitabiPoint[] = [];
  for (const g of groups) {
    for (const s of g.scenes) out.push(s);
  }
  return out;
}

export function visitedCountForPoints(
  points: readonly AnitabiPoint[],
  visited: VisitedMap
): number {
  let count = 0;
  for (const p of points) if (visited[p.id]) count += 1;
  return count;
}

export function capturedCountForPoints(
  points: readonly AnitabiPoint[],
  captures: Readonly<Record<string, PilgrimageCapture>>
): number {
  let count = 0;
  for (const p of points) if (captures[p.id]) count += 1;
  return count;
}
