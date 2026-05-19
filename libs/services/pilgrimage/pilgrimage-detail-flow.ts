import type { AnitabiPoint, AnitabiSpot } from './types';

export type PilgrimageDetailViewPreset = 'grid' | 'rows' | 'map';
export type PilgrimageDetailViewMode = 'list' | 'map';
export type PilgrimageDetailListLayout = 'grid' | 'rows';

export interface PilgrimageDetailViewState {
  viewMode: PilgrimageDetailViewMode;
  listLayout: PilgrimageDetailListLayout;
}

export function getPilgrimageDetailViewPreset(
  viewMode: PilgrimageDetailViewMode,
  listLayout: PilgrimageDetailListLayout
): PilgrimageDetailViewPreset {
  return viewMode === 'map' ? 'map' : listLayout;
}

export function resolvePilgrimageDetailViewPreset(
  preset: PilgrimageDetailViewPreset
): PilgrimageDetailViewState {
  if (preset === 'map') {
    return { viewMode: 'map', listLayout: 'grid' };
  }
  return { viewMode: 'list', listLayout: preset };
}

export function getInitialSpotSheetScene(spot: AnitabiSpot): AnitabiPoint | null {
  return spot.scenes[0] ?? null;
}

export function resolveSpotSheetSceneStack(
  activeSpot: AnitabiPoint | null,
  groupedSpot: AnitabiSpot | null | undefined
): readonly AnitabiPoint[] {
  if (!activeSpot) return [];
  if (!groupedSpot || groupedSpot.scenes.length === 0) return [activeSpot];
  if (!groupedSpot.scenes.some((scene) => scene.id === activeSpot.id)) return [activeSpot];
  return groupedSpot.scenes;
}

export function getSpotSheetVisitedTarget(
  activeSpot: AnitabiPoint | null,
  scenes: readonly AnitabiPoint[]
): AnitabiPoint | null {
  return scenes[0] ?? activeSpot;
}
