// Pins the viewport ⇄ BBox conversions the MapLibre engine uses to (a) emit
// onBoundsChange for the hub lazy-loader and (b) frame a cluster's leaves on tap.
import { describe, expect, it } from 'bun:test';
import {
  boundsToBBox,
  bboxToBounds,
  leavesToBBox,
} from '../../../libs/services/pilgrimage/map-engine/viewport';

describe('boundsToBBox (MapLibre visibleBounds [[E,N],[W,S]] → BBox)', () => {
  it('splits the NE/SW corners into named edges', () => {
    expect(boundsToBBox([[139.9, 35.8], [139.6, 35.5]])).toEqual({
      north: 35.8,
      east: 139.9,
      south: 35.5,
      west: 139.6,
    });
  });
});

describe('bboxToBounds (BBox → supercluster [W,S,E,N])', () => {
  it('orders edges the way getClusters expects', () => {
    expect(bboxToBounds({ north: 35.8, south: 35.5, east: 139.9, west: 139.6 })).toEqual([
      139.6, 35.5, 139.9, 35.8,
    ]);
  });
});

describe('leavesToBBox (min/max over points)', () => {
  it('frames a set of leaf coordinates', () => {
    expect(
      leavesToBBox([
        { lat: 35.5, lng: 139.6 },
        { lat: 35.8, lng: 139.9 },
        { lat: 35.6, lng: 139.7 },
      ])
    ).toEqual({ north: 35.8, south: 35.5, east: 139.9, west: 139.6 });
  });
  it('returns null for an empty set', () => {
    expect(leavesToBBox([])).toBeNull();
  });
});
