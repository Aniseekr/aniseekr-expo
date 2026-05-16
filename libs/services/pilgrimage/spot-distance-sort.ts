import type { LatLng } from './location-service';
import type { AnitabiPoint, AnitabiSpot } from './types';

const EARTH_RADIUS_KM = 6371;

function hasValidGeo(geo: readonly [number, number] | null | undefined): boolean {
  if (!geo || geo.length < 2) return false;
  const [lat, lng] = geo;
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

function distanceKm(userLocation: LatLng, geo: readonly [number, number]): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(geo[0] - userLocation.latitude);
  const dLng = toRad(geo[1] - userLocation.longitude);
  const lat1 = toRad(userLocation.latitude);
  const lat2 = toRad(geo[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function getSpotDistanceKm(
  spot: AnitabiSpot,
  userLocation: LatLng | null | undefined
): number | null {
  if (!userLocation) return null;

  let nearest = Number.POSITIVE_INFINITY;
  const candidates = [spot.geo, ...spot.scenes.map((scene) => scene.geo)];
  for (const geo of candidates) {
    if (!hasValidGeo(geo)) continue;
    const km = distanceKm(userLocation, geo);
    if (Number.isFinite(km) && km < nearest) nearest = km;
  }

  return Number.isFinite(nearest) ? nearest : null;
}

export function getNearestSceneForSpot(
  spot: AnitabiSpot,
  userLocation: LatLng | null | undefined
): AnitabiPoint {
  if (!userLocation) return spot.scenes[0];

  let nearestScene: AnitabiPoint | null = null;
  let nearestKm = Number.POSITIVE_INFINITY;
  for (const scene of spot.scenes) {
    if (!hasValidGeo(scene.geo)) continue;
    const km = distanceKm(userLocation, scene.geo);
    if (Number.isFinite(km) && km < nearestKm) {
      nearestScene = scene;
      nearestKm = km;
    }
  }

  return nearestScene ?? spot.scenes[0];
}

export function sortSpotsByDistance<T extends AnitabiSpot>(
  spots: readonly T[],
  userLocation: LatLng | null | undefined
): T[] {
  if (!userLocation) return [...spots];

  return spots
    .map((spot, index) => ({
      spot,
      index,
      distanceKm: getSpotDistanceKm(spot, userLocation),
    }))
    .sort((a, b) => {
      if (a.distanceKm === null && b.distanceKm === null) return a.index - b.index;
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;

      const diff = a.distanceKm - b.distanceKm;
      return Math.abs(diff) > Number.EPSILON ? diff : a.index - b.index;
    })
    .map(({ spot }) => spot);
}
