import type { CaptureSessionShot } from './capture-session';
import { getNumberParam, getStringParam, type RouterParams } from '../../utils/route-params';

function getFiniteNumber(params: RouterParams, key: string): number | null {
  const value = getNumberParam(params, key);
  return value !== null && Number.isFinite(value) ? value : null;
}

function getCaptureMode(params: RouterParams): CaptureSessionShot['captureMode'] {
  const mode = getStringParam(params, 'captureMode');
  return mode === 'burst' || mode === 'hdr' ? mode : 'single';
}

export function buildCaptureSessionShotFromRoute(params: RouterParams): CaptureSessionShot | null {
  const uri = getStringParam(params, 'shotUri');
  if (!uri) return null;

  const spotId = getStringParam(params, 'spotId') ?? 'unknown';
  const createdAt = getFiniteNumber(params, 'capturedAt') ?? 0;

  return {
    id: `route:${spotId}:${createdAt}:${uri}`,
    uri,
    width: getFiniteNumber(params, 'shotWidth') ?? 0,
    height: getFiniteNumber(params, 'shotHeight') ?? 0,
    captureMode: getCaptureMode(params),
    source: 'manual',
    createdAt,
    heading: getFiniteNumber(params, 'heading'),
    distanceMeters: getFiniteNumber(params, 'distanceMeters'),
    headingDeltaDeg: getFiniteNumber(params, 'headingDeltaDeg'),
    tilt: getFiniteNumber(params, 'tilt'),
  };
}
