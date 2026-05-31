// Pins the supercluster-backed clustering the MapLibre engine renders from:
// nearby markers collapse into a colour-dominant cluster at low zoom, every
// marker stands alone past maxZoom, and a cluster resolves back to its members.
import { describe, expect, it } from 'bun:test';
import type { MapMarker } from '../../../libs/services/pilgrimage/map-engine/types';
import {
  buildClusterIndex,
  clusterItemsFor,
  clusterLeaves,
} from '../../../libs/services/pilgrimage/map-engine/use-clustered-markers';

const m = (over: Partial<MapMarker>): MapMarker => ({
  id: 'x',
  lat: 35,
  lng: 135,
  kind: 'anime',
  title: 't',
  color: '#FF0000',
  ...over,
});

// Three markers within metres of each other (2 red, 1 blue) + one far away.
const markers: MapMarker[] = [
  m({ id: 'a', lat: 35.0, lng: 135.0, color: '#FF0000' }),
  m({ id: 'b', lat: 35.0001, lng: 135.0001, color: '#FF0000' }),
  m({ id: 'c', lat: 35.0002, lng: 135.0002, color: '#0000FF' }),
  m({ id: 'd', lat: 40.0, lng: 140.0, color: '#00FF00' }),
];
const wholeJapan = { north: 41, south: 34, east: 141, west: 134 };

describe('clusterItemsFor', () => {
  it('collapses nearby markers into one cluster at low zoom', () => {
    const index = buildClusterIndex(markers, 48, 16);
    const items = clusterItemsFor(index, { zoom: 5, bbox: wholeJapan });
    const clusters = items.filter((i) => i.type === 'cluster');
    const leaves = items.filter((i) => i.type === 'leaf');
    expect(clusters).toHaveLength(1);
    expect(leaves).toHaveLength(1); // the far 'd'
    if (clusters[0].type === 'cluster') {
      expect(clusters[0].count).toBe(3);
      expect(clusters[0].color).toBe('#FF0000'); // 2 red beats 1 blue
    }
  });

  it('shows every marker individually past maxZoom', () => {
    const index = buildClusterIndex(markers, 48, 16);
    const items = clusterItemsFor(index, { zoom: 18, bbox: wholeJapan });
    expect(items.every((i) => i.type === 'leaf')).toBe(true);
    expect(items).toHaveLength(4);
  });

  it('returns nothing without a viewport box', () => {
    const index = buildClusterIndex(markers);
    expect(clusterItemsFor(index, { zoom: 5, bbox: null })).toEqual([]);
  });
});

describe('clusterLeaves', () => {
  it('resolves a cluster back to its member ids', () => {
    const index = buildClusterIndex(markers, 48, 16);
    const items = clusterItemsFor(index, { zoom: 5, bbox: wholeJapan });
    const cluster = items.find((i) => i.type === 'cluster');
    expect(cluster?.type).toBe('cluster');
    if (cluster?.type === 'cluster') {
      const ids = clusterLeaves(index, cluster.clusterId)
        .map((l) => l.id)
        .sort();
      expect(ids).toEqual(['a', 'b', 'c']);
    }
  });
});
