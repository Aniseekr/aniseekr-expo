import { describe, expect, it } from 'bun:test';

import {
  getInitialSpotSheetScene,
  getPilgrimageDetailViewPreset,
  getSpotSheetVisitedTarget,
  resolvePilgrimageDetailViewPreset,
  resolveSpotSheetSceneStack,
} from '../../../libs/services/pilgrimage/pilgrimage-detail-flow';
import type { AnitabiPoint, AnitabiSpot } from '../../../libs/services/pilgrimage/types';

function point(id: string, ep: number): AnitabiPoint {
  return {
    id,
    name: `Spot ${id}`,
    image: `https://img/${id}.jpg`,
    ep,
    s: 0,
    geo: [35.66, 139.7],
  };
}

function spot(scenes: AnitabiPoint[]): AnitabiSpot {
  const head = scenes[0];
  return {
    id: head.id,
    name: head.name,
    cn: head.cn,
    image: head.image,
    geo: head.geo,
    scenes,
  };
}

describe('pilgrimage detail flow helpers', () => {
  it('collapses list/map and layout state into one view preset', () => {
    expect(getPilgrimageDetailViewPreset('list', 'grid')).toBe('grid');
    expect(getPilgrimageDetailViewPreset('list', 'rows')).toBe('rows');
    expect(getPilgrimageDetailViewPreset('map', 'grid')).toBe('map');

    expect(resolvePilgrimageDetailViewPreset('grid')).toEqual({
      viewMode: 'list',
      listLayout: 'grid',
    });
    expect(resolvePilgrimageDetailViewPreset('rows')).toEqual({
      viewMode: 'list',
      listLayout: 'rows',
    });
    expect(resolvePilgrimageDetailViewPreset('map')).toEqual({
      viewMode: 'map',
      listLayout: 'grid',
    });
  });

  it('opens a grouped spot on the first scene and keeps all scenes in the popup stack', () => {
    const scenes = [point('first', 1), point('second', 2), point('third', 3)];
    const grouped = spot(scenes);

    expect(getInitialSpotSheetScene(grouped)).toBe(scenes[0]);
    expect(resolveSpotSheetSceneStack(scenes[1], grouped)).toEqual(scenes);
  });

  it('binds the popup visited action to the first scene of a multi-image stack', () => {
    const scenes = [point('first', 1), point('second', 2)];

    expect(getSpotSheetVisitedTarget(scenes[1], scenes)).toBe(scenes[0]);
    expect(getSpotSheetVisitedTarget(scenes[1], [])).toBe(scenes[1]);
    expect(getSpotSheetVisitedTarget(null, [])).toBeNull();
  });
});
