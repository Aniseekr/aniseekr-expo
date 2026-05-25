// Pilgrimage data shapes returned by Anitabi (anitabi.cn) public API.
// See spec/pilgrimage_spec.md §3.

/**
 * A single anime scene/location point.
 *
 * Anitabi models one "point" per *scene-cut*, so a single real-world location
 * (a shrine, a station) is frequently several points. {@link groupPointsIntoSpots}
 * collapses those back into one {@link AnitabiSpot}.
 */
export interface AnitabiPoint {
  /** Stable id within an anime, e.g. "abc123". */
  id: string;
  /** Optional Chinese name of the spot. */
  cn?: string;
  /** Japanese name (canonical). */
  name: string;
  /** Scene screenshot URL (CDN-served, sometimes slow on first load). */
  image: string;
  /** Episode number where the scene appears. 0 when Anitabi has no value. */
  ep: number;
  /** Scene/second marker within the episode. 0 when Anitabi has no value. */
  s: number;
  /** [latitude, longitude]. May be [0, 0] for incomplete entries. */
  geo: [number, number];
  /**
   * Folder id — set on scene-cuts that Anitabi groups inside a folder. Points
   * sharing an `fid` (plus the folder parent whose `id` equals that `fid`) are
   * all cuts of the same real-world location.
   */
  fid?: string;
  /** True when this point is itself an Anitabi folder head (groups other cuts). */
  isFolder?: boolean;
  /**
   * Free-text attribution for the scene screenshot's contributor or source
   * (e.g. "日々是妄想", "Google Maps"). Required to honour Anitabi's
   * CC BY-NC-SA 4.0 licence when we render the image. Undefined when
   * Anitabi has no attribution on file.
   */
  origin?: string;
  /**
   * Canonical URL the screenshot's originator should link to (Google Maps
   * viewer link, blog post, etc.). Only present for points returned via
   * `/points/detail`; merged onto `/points` rows by id during fetch.
   */
  originURL?: string;
}

/**
 * Anime entry from Anitabi (the "container" wrapping the points list).
 */
export interface AnitabiBangumi {
  /** Bangumi subject ID — the cross-platform link key. */
  id: number;
  /** Chinese title. May be empty string. */
  cn: string;
  /** Japanese title (original). */
  title: string;
  /** Primary city/prefecture, e.g. "東京都". */
  city: string;
  /** Cover image URL. */
  cover: string;
  /** Dominant theme color hex string, e.g. "#8DC5D8". */
  color: string;
  /** Center coordinates [lat, lng]. */
  geo: [number, number];
  /** Recommended map zoom level (8–14). */
  zoom: number;
  /** Last-modified epoch (seconds or ms depending on server). */
  modified: number;
  /** Up to ~10 sample points used for cards. */
  litePoints: AnitabiPoint[];
  /** Total spot count across the whole anime. */
  pointsLength: number;
  /** Total scene image count. */
  imagesLength: number;
}

/**
 * A real-world location with one or more anime scene-cuts.
 *
 * Produced by {@link groupPointsIntoSpots}. Anitabi's API hands back one
 * {@link AnitabiPoint} per scene-cut, so a shrine that appears in five shots is
 * five points; an `AnitabiSpot` is the single location the user actually walks
 * to, carrying every cut filmed there.
 */
export interface AnitabiSpot {
  /** Representative point id (folder parent, else the first scene). */
  id: string;
  /** Representative location name. */
  name: string;
  /** Representative Chinese name, when Anitabi has one. */
  cn?: string;
  /** Representative coordinate [lat, lng]. */
  geo: [number, number];
  /** Representative scene image. */
  image: string;
  /** Every scene-cut at this location, representative first. Always length >= 1. */
  scenes: AnitabiPoint[];
}

/**
 * Loosely-typed point exactly as returned by `GET /bangumi/{id}/points`
 * (pre-normalisation). Field types are intentionally `unknown` — the live API
 * returns `ep`/`s` as number, numeric string, empty string, or null, and image
 * URLs as relative paths. {@link normalizeRawPoints} narrows everything.
 */
export interface RawAnitabiPoint {
  id?: unknown;
  name?: unknown;
  cn?: unknown;
  image?: unknown;
  ep?: unknown;
  s?: unknown;
  geo?: unknown;
  fid?: unknown;
  isFolder?: unknown;
  origin?: unknown;
  originURL?: unknown;
}

/** `GET /bangumi/{id}/points` response wrapper (the full, complete point list). */
export interface RawAnitabiBangumiPoints {
  points?: RawAnitabiPoint[];
}

/**
 * `GET /bangumi/{id}/points/detail` response — a flat array, NOT wrapped in
 * `{ points: [...] }`. Server-side deduplicated (smaller than `/points`),
 * but the only endpoint that includes `originURL` per point.
 */
export type RawAnitabiPointsDetail = RawAnitabiPoint[];
