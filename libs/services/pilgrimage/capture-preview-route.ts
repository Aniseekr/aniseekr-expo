import {
  sanitizeCaptureNote,
  type CaptureGeoLocation,
  type CaptureSessionShot,
  type CaptureSessionSource,
} from './capture-session';
import { getNumberParam, getStringParam, type RouterParams } from '../../utils/route-params';

function getFiniteNumber(params: RouterParams, key: string): number | null {
  const value = getNumberParam(params, key);
  return value !== null && Number.isFinite(value) ? value : null;
}

function getCaptureMode(params: RouterParams): CaptureSessionShot['captureMode'] {
  const mode = getStringParam(params, 'captureMode');
  return mode === 'burst' || mode === 'hdr' ? mode : 'single';
}

function getCaptureSource(params: RouterParams): CaptureSessionSource {
  const source = getStringParam(params, 'shotSource');
  return source === 'auto' || source === 'library' ? source : 'manual';
}

function getUserLocation(params: RouterParams): CaptureGeoLocation | null {
  const latitude = getFiniteNumber(params, 'userLat');
  const longitude = getFiniteNumber(params, 'userLng');
  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
}

export function buildCaptureSessionShotFromRoute(params: RouterParams): CaptureSessionShot | null {
  const uri = getStringParam(params, 'shotUri');
  if (!uri) return null;

  const spotId = getStringParam(params, 'spotId') ?? 'unknown';
  const createdAt = getFiniteNumber(params, 'capturedAt') ?? 0;
  const note = sanitizeCaptureNote(getStringParam(params, 'note'));

  return {
    id: `route:${spotId}:${createdAt}:${uri}`,
    uri,
    width: getFiniteNumber(params, 'shotWidth') ?? 0,
    height: getFiniteNumber(params, 'shotHeight') ?? 0,
    captureMode: getCaptureMode(params),
    source: getCaptureSource(params),
    createdAt,
    heading: getFiniteNumber(params, 'heading'),
    distanceMeters: getFiniteNumber(params, 'distanceMeters'),
    headingDeltaDeg: getFiniteNumber(params, 'headingDeltaDeg'),
    tilt: getFiniteNumber(params, 'tilt'),
    userLocation: getUserLocation(params),
    ...(note ? { note } : {}),
  };
}

export function resolveCapturePreviewFocus(
  previousFocusedId: string | null,
  shots: readonly CaptureSessionShot[]
): string | null {
  if (previousFocusedId && shots.some((shot) => shot.id === previousFocusedId)) {
    return previousFocusedId;
  }
  return shots[0]?.id ?? null;
}

export function reconcileCapturePreviewSelection(
  previousSelectedIds: Set<string>,
  shots: readonly CaptureSessionShot[]
): Set<string> {
  const valid = new Set<string>();
  for (const shot of shots) {
    if (previousSelectedIds.has(shot.id)) valid.add(shot.id);
  }
  if (valid.size === 0 && shots[0]) valid.add(shots[0].id);
  if (setsEqual(previousSelectedIds, valid)) return previousSelectedIds;
  return valid;
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}
