// Normalisation + grouping for the Anitabi `/bangumi/{id}/points` payload.
//
// Two transforms live here:
//   - normalizeRawPoints: loose RawAnitabiPoint[] -> clean AnitabiPoint[].
//     Coerces ep/s (number | numeric-string | "" | null), resolves relative
//     image URLs, and drops points with no scene image — a pilgrimage spot
//     with no reference frame is useless for the compare feature, and Anitabi's
//     own `imagesLength` excludes them too.
//   - groupPointsIntoSpots: AnitabiPoint[] -> AnitabiSpot[]. Anitabi returns
//     one point per *scene-cut*, so a single shrine is often 5+ points sharing
//     a name. This collapses cuts of the same location into one spot.

import { normalizeAnitabiImageUrl } from './anitabi-image';
import type { AnitabiPoint, AnitabiSpot, RawAnitabiPoint } from './types';

/** Two cuts with the same name within this many metres are treated as one spot. */
const PROXIMITY_MERGE_M = 60;
const EARTH_RADIUS_M = 6_371_000;

/**
 * Narrow a raw `/points` payload into clean {@link AnitabiPoint}s.
 *
 * - `ep`/`s` arrive as number | numeric-string | "" | null — coerced to a
 *   finite number, defaulting to 0 when Anitabi has no value.
 * - `image` arrives as a relative `/images/...` path — resolved to an absolute
 *   CDN thumbnail URL.
 * - Points without a scene image, id, or name are dropped.
 */
export function normalizeRawPoints(
  raw: readonly RawAnitabiPoint[] | undefined | null,
  bangumiId: number
): AnitabiPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: AnitabiPoint[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const id = typeof p.id === 'string' ? p.id.trim() : '';
    if (!id) continue;
    const name = typeof p.name === 'string' ? p.name.trim() : '';
    if (!name) continue;
    // Drop imageless points — no reference frame ⇒ nothing to compare against.
    if (typeof p.image !== 'string' || p.image.trim().length === 0) continue;

    out.push({
      id,
      name,
      cn: typeof p.cn === 'string' && p.cn.trim().length > 0 ? p.cn.trim() : undefined,
      image: normalizeAnitabiImageUrl(p.image, bangumiId),
      ep: coerceNumber(p.ep),
      s: coerceNumber(p.s),
      geo: coerceGeo(p.geo),
      fid: typeof p.fid === 'string' && p.fid.trim().length > 0 ? p.fid.trim() : undefined,
      isFolder: p.isFolder === true ? true : undefined,
      origin:
        typeof p.origin === 'string' && p.origin.trim().length > 0 ? p.origin.trim() : undefined,
      originURL:
        typeof p.originURL === 'string' && p.originURL.trim().length > 0
          ? p.originURL.trim()
          : undefined,
    });
  }
  return out;
}

/**
 * Collapse per-scene {@link AnitabiPoint}s into per-location {@link AnitabiSpot}s.
 *
 * Grouping strategy, in priority order:
 *   1. Anitabi's own folder structure — points sharing an `fid` (and the
 *      `isFolder` parent whose `id` equals that `fid`) are one location.
 *   2. Fallback for anime with no folders (e.g. ゆるキャン): points with the
 *      same name within {@link PROXIMITY_MERGE_M} metres of each other.
 *
 * Output order is stable: spots ordered by the earliest input appearance of
 * any member; scenes within a spot ordered folder-parent-first then input
 * order, so `scenes[0]` is always the representative.
 */
export function groupPointsIntoSpots(points: readonly AnitabiPoint[]): AnitabiSpot[] {
  if (points.length === 0) return [];

  const indexOf = new Map<string, number>();
  points.forEach((p, i) => indexOf.set(p.id, i));

  // Pass 1 — Anitabi folder groups (authoritative).
  // A folder child carries `fid`; the folder head carries `isFolder` and its
  // own `id` equals the children's `fid`, so both land under the same key.
  const folderGroups = new Map<string, AnitabiPoint[]>();
  const loose: AnitabiPoint[] = [];
  for (const p of points) {
    const key = p.fid ?? (p.isFolder ? p.id : null);
    if (key) {
      const arr = folderGroups.get(key);
      if (arr) arr.push(p);
      else folderGroups.set(key, [p]);
    } else {
      loose.push(p);
    }
  }

  // Pass 2 — name + proximity fallback for everything Anitabi left ungrouped.
  const looseGroups: AnitabiPoint[][] = [];
  for (const p of loose) {
    const key = pointNameKey(p);
    let placed = false;
    if (key) {
      for (const group of looseGroups) {
        const head = group[0];
        if (pointNameKey(head) !== key) continue;
        if (!hasGeo(head.geo) || !hasGeo(p.geo)) continue;
        if (distanceMeters(head.geo, p.geo) <= PROXIMITY_MERGE_M) {
          group.push(p);
          placed = true;
          break;
        }
      }
    }
    if (!placed) looseGroups.push([p]);
  }

  const spots = [...folderGroups.values(), ...looseGroups].map((members) =>
    toSpot(members, indexOf)
  );
  spots.sort((a, b) => firstIndex(a, indexOf) - firstIndex(b, indexOf));
  return spots;
}

// ---------- helpers ----------

function toSpot(members: AnitabiPoint[], indexOf: Map<string, number>): AnitabiSpot {
  const scenes = [...members].sort((a, b) => {
    // Folder head leads so it becomes the spot's representative.
    if (!!a.isFolder !== !!b.isFolder) return a.isFolder ? -1 : 1;
    return (indexOf.get(a.id) ?? 0) - (indexOf.get(b.id) ?? 0);
  });
  const head = scenes[0];
  return {
    id: head.id,
    name: displayName(head),
    cn: textOrUndefined(head.cn),
    geo: head.geo,
    image: head.image,
    scenes,
  };
}

function firstIndex(spot: AnitabiSpot, indexOf: Map<string, number>): number {
  let min = Number.POSITIVE_INFINITY;
  for (const s of spot.scenes) {
    const i = indexOf.get(s.id);
    if (i !== undefined && i < min) min = i;
  }
  return min;
}

function coerceNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function coerceGeo(value: unknown): [number, number] {
  if (Array.isArray(value) && value.length >= 2) {
    const lat = Number(value[0]);
    const lng = Number(value[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
  }
  return [0, 0];
}

function hasGeo(geo: [number, number]): boolean {
  return (
    Number.isFinite(geo[0]) &&
    Number.isFinite(geo[1]) &&
    !(geo[0] === 0 && geo[1] === 0)
  );
}

function pointNameKey(point: AnitabiPoint): string | null {
  return textKey(point.name) ?? textKey(point.cn);
}

function textKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const key = value.normalize('NFKC').trim().toLowerCase();
  return key.length > 0 ? key : null;
}

function displayName(point: AnitabiPoint): string {
  return textOrUndefined(point.name) ?? textOrUndefined(point.cn) ?? '';
}

function textOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function distanceMeters(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
