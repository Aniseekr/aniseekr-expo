// Neutral markers → a GeoJSON FeatureCollection for the MapLibre engine's
// clustered source. Extracted from the engine so the lng-first coordinate order
// (GL uses [lng, lat]; our MapMarker is {lat, lng}) is unit-testable without a
// native render. Properties carry id/kind/color so a circle layer can colour
// points and a feature tap can resolve back to the source marker.
import type { MapMarker } from './types';

export function markersToFeatureCollection(
  markers: readonly MapMarker[]
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: markers.map((m) => ({
      type: 'Feature',
      id: m.id,
      properties: { id: m.id, kind: m.kind, color: m.color, visited: m.visited ? 1 : 0 },
      geometry: { type: 'Point', coordinates: [m.lng, m.lat] },
    })),
  };
}
