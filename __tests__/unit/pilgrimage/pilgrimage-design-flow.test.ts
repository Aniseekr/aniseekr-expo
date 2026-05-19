import { describe, expect, it } from 'bun:test';

import {
  resolvePilgrimageMapInitialMode,
  shouldLoadPilgrimageMapBounds,
} from '../../../libs/services/pilgrimage/pilgrimage-design-flow';

describe('pilgrimage design flow helpers', () => {
  it('opens the see-all pilgrimage screen map-first unless list is explicitly requested', () => {
    expect(resolvePilgrimageMapInitialMode(undefined)).toBe('map');
    expect(resolvePilgrimageMapInitialMode('map')).toBe('map');
    expect(resolvePilgrimageMapInitialMode('list')).toBe('list');
    expect(resolvePilgrimageMapInitialMode(['list', 'map'])).toBe('list');
    expect(resolvePilgrimageMapInitialMode('unknown')).toBe('map');
  });

  it('loads map bounds only after the user is looking at a local area', () => {
    expect(
      shouldLoadPilgrimageMapBounds({
        south: 24,
        west: 122.9,
        north: 45.6,
        east: 146,
      })
    ).toBe(false);

    expect(
      shouldLoadPilgrimageMapBounds({
        south: 35.5,
        west: 139.3,
        north: 35.9,
        east: 140,
      })
    ).toBe(true);
  });
});
