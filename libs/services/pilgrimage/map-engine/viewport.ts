// Viewport ⇄ BBox conversions for the MapLibre engine. Extracted so the
// coordinate-order plumbing (MapLibre visibleBounds, supercluster bbox) is
// unit-testable without a native render.
import type { BBox, LatLng } from './types';

/** MapLibre `getVisibleBounds()` → BBox. Returns [[E,N],[W,S]] (NE then SW corner). */
export function boundsToBBox(visibleBounds: [[number, number], [number, number]]): BBox {
  const [[east, north], [west, south]] = visibleBounds;
  return { north, east, south, west };
}

/** BBox → supercluster `getClusters` bbox `[westLng, southLat, eastLng, northLat]`. */
export function bboxToBounds(box: BBox): [number, number, number, number] {
  return [box.west, box.south, box.east, box.north];
}

/** Min/max frame over a set of points (e.g. a cluster's leaves). Null if empty. */
export function leavesToBBox(points: readonly LatLng[]): BBox | null {
  if (points.length === 0) return null;
  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;
  for (const p of points) {
    if (p.lat > north) north = p.lat;
    if (p.lat < south) south = p.lat;
    if (p.lng > east) east = p.lng;
    if (p.lng < west) west = p.lng;
  }
  return { north, south, east, west };
}
