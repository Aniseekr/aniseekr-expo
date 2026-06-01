import { FEATURED_PILGRIMAGE_ANIME } from './featured-anime';
import { getIndexedById } from './anitabi-index';
import type { LatLng } from './location-service';
import type { AnitabiBangumi } from './types';
import type { PilgrimageHubSnapshot } from './pilgrimage-hub-cache';
import { buildSeededPilgrimageAnimes } from './pilgrimage-screen-state';

const HUB_FOCUS_ZOOM = 11;
const JAPAN_BOUNDS = {
  south: 24.0,
  west: 122.9,
  north: 45.6,
  east: 146.0,
} as const;
const EARTH_RADIUS_KM = 6371;

export interface PilgrimageHubInitialView {
  center?: { lat: number; lng: number };
  zoom?: number;
}

export interface PilgrimageHubInitialViewInput {
  focusBangumiId: number | null;
  snapshot: PilgrimageHubSnapshot | null;
  fallbackFeaturedIds?: readonly number[];
}

export function resolvePilgrimageHubInitialView({
  focusBangumiId,
  snapshot,
  fallbackFeaturedIds = FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) => bangumiId),
}: PilgrimageHubInitialViewInput): PilgrimageHubInitialView {
  if (focusBangumiId != null) {
    const focused = getIndexedById(focusBangumiId);
    if (focused && isFiniteGeo(focused.lat, focused.lng)) {
      return toView(focused.lat, focused.lng);
    }
    const snapshotFocused = findSnapshotAnime(snapshot, focusBangumiId);
    if (snapshotFocused && isValidAnimeGeo(snapshotFocused)) {
      return toView(snapshotFocused.geo[0], snapshotFocused.geo[1]);
    }
  }

  const candidates = buildInitialAnimeCandidates(snapshot, fallbackFeaturedIds);
  const userLocation = snapshot?.userLocation ?? null;
  const selectedAnime = selectInitialAnime(candidates, userLocation);
  if (selectedAnime && isValidAnimeGeo(selectedAnime)) {
    return toView(selectedAnime.geo[0], selectedAnime.geo[1]);
  }

  if (userLocation && pointInJapan(userLocation)) {
    return toView(userLocation.latitude, userLocation.longitude);
  }

  return {};
}

function findSnapshotAnime(
  snapshot: PilgrimageHubSnapshot | null,
  bangumiId: number
): AnitabiBangumi | null {
  for (const anime of snapshot?.collectionAnimes ?? []) {
    if (anime.id === bangumiId) return anime;
  }
  for (const anime of snapshot?.featuredAnimes ?? []) {
    if (anime.id === bangumiId) return anime;
  }
  return null;
}

function buildInitialAnimeCandidates(
  snapshot: PilgrimageHubSnapshot | null,
  fallbackFeaturedIds: readonly number[]
): AnitabiBangumi[] {
  const merged = new Map<number, AnitabiBangumi>();
  for (const anime of buildSeededPilgrimageAnimes(fallbackFeaturedIds)) {
    merged.set(anime.id, anime);
  }
  for (const anime of snapshot?.collectionAnimes ?? []) {
    merged.set(anime.id, anime);
  }
  for (const anime of snapshot?.featuredAnimes ?? []) {
    merged.set(anime.id, anime);
  }
  return [...merged.values()].filter(isValidAnimeGeo);
}

function selectInitialAnime(
  candidates: readonly AnitabiBangumi[],
  userLocation: LatLng | null
): AnitabiBangumi | null {
  if (candidates.length === 0) return null;
  const hasUserLocationInJapan = userLocation != null && pointInJapan(userLocation);
  const ranked = [...candidates];
  ranked.sort((a, b) => {
    if (hasUserLocationInJapan) {
      const da = distanceKm(userLocation, { latitude: a.geo[0], longitude: a.geo[1] });
      const db = distanceKm(userLocation, { latitude: b.geo[0], longitude: b.geo[1] });
      if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return da - db;
      if (Number.isFinite(da)) return -1;
      if (Number.isFinite(db)) return 1;
    }
    return (b.pointsLength ?? 0) - (a.pointsLength ?? 0);
  });
  return ranked[0] ?? null;
}

function isValidAnimeGeo(anime: AnitabiBangumi): anime is AnitabiBangumi & {
  geo: [number, number];
} {
  return Array.isArray(anime.geo) && isFiniteGeo(anime.geo[0], anime.geo[1]);
}

function isFiniteGeo(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

function pointInJapan(loc: LatLng): boolean {
  return (
    loc.latitude >= JAPAN_BOUNDS.south &&
    loc.latitude <= JAPAN_BOUNDS.north &&
    loc.longitude >= JAPAN_BOUNDS.west &&
    loc.longitude <= JAPAN_BOUNDS.east
  );
}

function toView(lat: number, lng: number): PilgrimageHubInitialView {
  return { center: { lat, lng }, zoom: HUB_FOCUS_ZOOM };
}

function distanceKm(a: LatLng, b: LatLng): number {
  if (
    !Number.isFinite(a.latitude) ||
    !Number.isFinite(a.longitude) ||
    !Number.isFinite(b.latitude) ||
    !Number.isFinite(b.longitude)
  ) {
    return Number.NaN;
  }
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}
