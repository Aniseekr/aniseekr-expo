// Behavioural pin for engine-neutral marker normalization (migration spec §4.1:
// "existing *.data.json → normalized to MapMarker[] once, engine-independent").
//
// The converters must be FAITHFUL both ways so the Leaflet adapter can keep
// rendering today's HubMapMarker / scene markers from the neutral model with no
// data loss:
// - hub anime balloon  <-> MapMarker(kind:'anime')
// - Tourism-88 pin (is88) <-> MapMarker(kind:'city88') with eightyEightId
// - scene marker <-> MapMarker(kind:'spot') with episode + markerMode + visited

import { describe, expect, it } from 'bun:test';
import {
  hubMarkerToMapMarker,
  mapMarkerToHubMarker,
  sceneMarkerToMapMarker,
  mapMarkerToSceneMarker,
  type SceneMarkerInput,
} from '../../../libs/services/pilgrimage/map-engine/normalize';
import type { HubMapMarker } from '../../../libs/services/pilgrimage/map-engine/hub-marker';

const animeHub: HubMapMarker = {
  markerId: 'bgm:265',
  bangumiId: 265,
  lat: 35.01,
  lng: 135.76,
  cover: 'https://img/cover.jpg',
  title: 'K-On!',
  city: 'Kyoto',
  pointsLength: 12,
  ringColor: '#FF5577',
};

const eightyEightHub: HubMapMarker = {
  markerId: '88:7',
  bangumiId: 999,
  lat: 34.7,
  lng: 135.5,
  cover: 'https://img/88.jpg',
  title: 'Lucky Star Shrine',
  city: 'Washinomiya',
  pointsLength: 3,
  ringColor: '#D4AF37',
  is88: true,
  eightyEightId: 7,
};

describe('hubMarkerToMapMarker', () => {
  it('maps an anime balloon to kind:anime, preserving identity + cover + ring', () => {
    const m = hubMarkerToMapMarker(animeHub);
    expect(m.kind).toBe('anime');
    expect(m.id).toBe('bgm:265');
    expect(m.bangumiId).toBe(265);
    expect(m.image).toBe('https://img/cover.jpg');
    expect(m.color).toBe('#FF5577');
    expect(m.pointsLength).toBe(12);
    expect(m.eightyEightId).toBeUndefined();
  });

  it('maps a Tourism-88 pin (is88) to kind:city88 carrying eightyEightId', () => {
    const m = hubMarkerToMapMarker(eightyEightHub);
    expect(m.kind).toBe('city88');
    expect(m.eightyEightId).toBe(7);
  });
});

describe('hub <-> MapMarker round-trip', () => {
  it('preserves every HubMapMarker field through map -> hub', () => {
    expect(mapMarkerToHubMarker(hubMarkerToMapMarker(animeHub))).toEqual(animeHub);
    expect(mapMarkerToHubMarker(hubMarkerToMapMarker(eightyEightHub))).toEqual(eightyEightHub);
  });
});

describe('scene <-> MapMarker round-trip', () => {
  const scene: SceneMarkerInput = {
    id: 'p:42',
    lat: 35.02,
    lng: 135.77,
    title: 'Sakuragaoka HS gate',
    image: 'https://img/scene.jpg',
    ep: 2,
    ringColor: '#33AACC',
    visited: true,
    markerMode: 'dot',
  };

  it('maps a scene marker to kind:spot with episode + markerMode + visited', () => {
    const m = sceneMarkerToMapMarker(scene);
    expect(m.kind).toBe('spot');
    expect(m.episode).toBe(2);
    expect(m.markerMode).toBe('dot');
    expect(m.visited).toBe(true);
    expect(m.image).toBe('https://img/scene.jpg');
  });

  it('preserves every scene field through map -> scene', () => {
    expect(mapMarkerToSceneMarker(sceneMarkerToMapMarker(scene))).toEqual(scene);
  });
});
