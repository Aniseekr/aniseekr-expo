// Engine-neutral marker normalization.
//
// Converts between the existing engine-specific marker shapes (today's
// `HubMapMarker` for anime balloons + Tourism-88 pins, and the spot-detail
// scene marker) and the neutral `MapMarker`. Faithful both ways so the Leaflet
// adapter can keep rendering today's markers from the neutral model with no
// data loss, and the MapLibre engine can consume the same neutral input.
//
// Pure functions, no runtime deps — `import type` is erased at compile time.
import type { MapMarker, MapMarkerMode } from './types';
import type { HubMapMarker } from './hub-marker';

/** Scene marker payload as built today by SpotMapView (`MapMarkerPayload`). */
export interface SceneMarkerInput {
  id: string;
  lat: number;
  lng: number;
  title: string;
  image: string;
  ep: number;
  ringColor: string;
  visited: boolean;
  markerMode: MapMarkerMode;
}

/** Hub anime balloon / Tourism-88 pin → neutral marker. */
export function hubMarkerToMapMarker(h: HubMapMarker): MapMarker {
  const m: MapMarker = {
    id: h.markerId,
    lat: h.lat,
    lng: h.lng,
    kind: h.is88 ? 'city88' : 'anime',
    title: h.title,
    image: h.cover,
    color: h.ringColor,
    bangumiId: h.bangumiId,
    city: h.city,
    pointsLength: h.pointsLength,
  };
  if (h.is88 && h.eightyEightId !== undefined) m.eightyEightId = h.eightyEightId;
  return m;
}

/** Neutral marker → hub marker (for the Leaflet hub adapter). */
export function mapMarkerToHubMarker(m: MapMarker): HubMapMarker {
  const h: HubMapMarker = {
    markerId: m.id,
    bangumiId: m.bangumiId ?? 0,
    lat: m.lat,
    lng: m.lng,
    cover: m.image ?? '',
    title: m.title,
    city: m.city ?? '',
    pointsLength: m.pointsLength ?? 0,
    ringColor: m.color,
  };
  if (m.kind === 'city88') {
    h.is88 = true;
    if (m.eightyEightId !== undefined) h.eightyEightId = m.eightyEightId;
  }
  return h;
}

/** Spot-detail scene marker → neutral marker. */
export function sceneMarkerToMapMarker(s: SceneMarkerInput): MapMarker {
  return {
    id: s.id,
    lat: s.lat,
    lng: s.lng,
    kind: 'spot',
    title: s.title,
    image: s.image,
    color: s.ringColor,
    visited: s.visited,
    episode: s.ep,
    markerMode: s.markerMode,
  };
}

/** Neutral marker → scene payload (for the Leaflet spot adapter). */
export function mapMarkerToSceneMarker(m: MapMarker): SceneMarkerInput {
  return {
    id: m.id,
    lat: m.lat,
    lng: m.lng,
    title: m.title,
    image: m.image ?? '',
    ep: m.episode ?? 0,
    ringColor: m.color,
    visited: m.visited ?? false,
    markerMode: m.markerMode ?? 'bubble',
  };
}
