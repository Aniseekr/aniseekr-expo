// Index of anime centres anitabi.cn has pilgrimage data for.
//
// Two-tier loading:
//   1. Cold start: bundled JSON below (small fallback seed, always available
//      offline).
//   2. Runtime hydration: anitabi-data-service downloads the latest version
//      from Aniseekr-source's `anitabi-index` GitHub Release alias asset
//      (built daily from api.anitabi.cn/bangumi) and calls
//      `hydrateFromRuntime()` to swap in the larger payload (~781 entries).
//
// Lookup APIs stay sync — they always read whichever file is currently
// active. Callers don't need to know whether they're seeing the bundled or
// runtime payload; the only difference is coverage.

import indexJson from './anitabi-index.data.json';

export interface AnitabiIndexEntry {
  /** Bangumi subject id. */
  id: number;
  /** Japanese title (canonical). */
  title: string;
  /** Chinese title (empty when Anitabi has none). */
  cn: string;
  /** Primary city/prefecture, empty when unknown. */
  city: string;
  /** Cover image URL (Anitabi CDN). */
  cover: string;
  /** Dominant theme color hex string. Empty when Anitabi has none. */
  color: string;
  /** Latitude of the anime's pilgrimage centre. */
  lat: number;
  /** Longitude of the anime's pilgrimage centre. */
  lng: number;
  /** Recommended Leaflet zoom level (rounded to 1 decimal). */
  zoom: number;
  /** Total point count across the anime (`pointsLength` from `/lite`). */
  pointsLength: number;
  /**
   * Episode count from Anitabi (when known). Used downstream by the L2
   * cross-index builder for AniList disambiguation. `null` when Anitabi has
   * no value or the index pre-dates this column.
   */
  episodes?: number | null;
  /**
   * First-air year from Anitabi (when known). Same disambiguation role as
   * `episodes`. Optional for backwards compatibility with older index files.
   */
  startYear?: number | null;
  /** Index build timestamp (epoch ms). */
  builtAt: number;
}

interface IndexFile {
  generatedAt: number;
  source: string;
  entries: AnitabiIndexEntry[];
  /** True when this payload came from the runtime fallback path (smaller). Optional for backwards compat with bundled JSON. */
  fallbackUsed?: boolean;
}

// Mutable so anitabi-data-service can replace it after runtime fetch.
let INDEX = indexJson as unknown as IndexFile;

/**
 * Replace the in-memory index with a freshly-downloaded payload. Called by
 * anitabi-data-service after `_layout.tsx` startup hydration. Existing sync
 * callers automatically see the new entries on their next call.
 */
export function hydrateFromRuntime(file: IndexFile): void {
  if (!file || !Array.isArray(file.entries)) return;
  INDEX = file;
}

/** Map bounding box (Leaflet-style: north > south, east > west except across antimeridian). */
export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface QueryOptions {
  /** Cap on the number of ids returned. Defaults to all. */
  limit?: number;
  /** Bangumi ids to exclude (e.g. already-loaded). */
  exclude?: ReadonlySet<number> | readonly number[];
}

interface NearbyQuery {
  lat: number;
  lng: number;
  /** Radius in kilometres. */
  radiusKm: number;
}

const EARTH_RADIUS_KM = 6371;

/**
 * All indexed entries. Useful for seeding initial state or for tests that need
 * the raw list. Do NOT mutate.
 */
export function getAllIndexed(): readonly AnitabiIndexEntry[] {
  return INDEX.entries;
}

/** Build timestamp of the shipped index (epoch ms). */
export function getIndexGeneratedAt(): number {
  return INDEX.generatedAt;
}

/**
 * Return entries inside the supplied bounding box, optionally limited and
 * excluding a set of ids. Handles bounds that cross the antimeridian
 * (e.g. east=-170, west=170 means the Pacific corridor).
 */
export function getAnimeInBounds(
  bounds: BoundingBox,
  options: QueryOptions = {}
): AnitabiIndexEntry[] {
  if (!isFiniteBox(bounds)) return [];
  const exclude = toSet(options.exclude);
  const limit = sanitiseLimit(options.limit);

  const out: AnitabiIndexEntry[] = [];
  for (const entry of INDEX.entries) {
    if (exclude.has(entry.id)) continue;
    if (!pointInBounds(entry.lat, entry.lng, bounds)) continue;
    out.push(entry);
    if (limit !== null && out.length >= limit) break;
  }
  return out;
}

/**
 * Return entries whose centre falls within `radiusKm` of `(lat, lng)`,
 * sorted by ascending distance.
 */
export function getAnimeNear(
  query: NearbyQuery,
  options: QueryOptions = {}
): Array<AnitabiIndexEntry & { distanceKm: number }> {
  if (!Number.isFinite(query.lat) || !Number.isFinite(query.lng)) return [];
  if (!Number.isFinite(query.radiusKm) || query.radiusKm <= 0) return [];

  const exclude = toSet(options.exclude);
  const limit = sanitiseLimit(options.limit);

  const matches: Array<AnitabiIndexEntry & { distanceKm: number }> = [];
  for (const entry of INDEX.entries) {
    if (exclude.has(entry.id)) continue;
    const distanceKm = haversineKm(query.lat, query.lng, entry.lat, entry.lng);
    if (distanceKm > query.radiusKm) continue;
    matches.push({ ...entry, distanceKm });
  }
  matches.sort((a, b) => a.distanceKm - b.distanceKm);

  if (limit !== null) return matches.slice(0, limit);
  return matches;
}

// ---------- helpers ----------

function pointInBounds(lat: number, lng: number, b: BoundingBox): boolean {
  if (lat > b.north || lat < b.south) return false;
  // Antimeridian-aware longitude check.
  if (b.west <= b.east) {
    return lng >= b.west && lng <= b.east;
  }
  return lng >= b.west || lng <= b.east;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function isFiniteBox(b: BoundingBox): boolean {
  return (
    Number.isFinite(b.north) &&
    Number.isFinite(b.south) &&
    Number.isFinite(b.east) &&
    Number.isFinite(b.west) &&
    b.north >= b.south
  );
}

function toSet(input: QueryOptions['exclude']): ReadonlySet<number> {
  if (!input) return new Set();
  if (input instanceof Set) return input;
  return new Set(input);
}

function sanitiseLimit(limit: number | undefined): number | null {
  if (typeof limit !== 'number') return null;
  if (!Number.isFinite(limit) || limit <= 0) return null;
  return Math.floor(limit);
}
