// Behavioural pin for neutral markers -> GeoJSON FeatureCollection.
// The MapLibre engine feeds this to a clustered GeoJSON source. The lng-FIRST
// coordinate order ([lng, lat]) is the easy regression this test guards — GL
// uses longitude first, our MapMarker is {lat, lng}.

import { describe, expect, it } from 'bun:test';
import { markersToFeatureCollection } from '../../../libs/services/pilgrimage/map-engine/feature-collection';
import type { MapMarker } from '../../../libs/services/pilgrimage/map-engine/types';

const markers: MapMarker[] = [
  { id: 'a', lat: 35.0, lng: 135.7, kind: 'anime', title: 'A', color: '#FF0000' },
  { id: 'b', lat: 34.5, lng: 135.2, kind: 'spot', title: 'B', color: '#00FF00', visited: true },
];

describe('markersToFeatureCollection', () => {
  it('emits one Point feature per marker with [lng, lat] order (lng first)', () => {
    const fc = markersToFeatureCollection(markers);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [135.7, 35.0] });
  });

  it('carries id/kind/color and encodes visited as 1/0 in properties', () => {
    const fc = markersToFeatureCollection(markers);
    expect(fc.features[0].properties).toMatchObject({
      id: 'a',
      kind: 'anime',
      color: '#FF0000',
      visited: 0,
    });
    expect(fc.features[1].properties).toMatchObject({ id: 'b', kind: 'spot', visited: 1 });
  });

  it('sets the GeoJSON feature id so native feature taps resolve back to a marker', () => {
    expect(markersToFeatureCollection(markers).features[0].id).toBe('a');
  });

  it('returns an empty collection for no markers', () => {
    expect(markersToFeatureCollection([])).toEqual({ type: 'FeatureCollection', features: [] });
  });
});
