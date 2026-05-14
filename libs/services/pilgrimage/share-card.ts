import { getNumberParam, getStringParam, type RouterParams } from '../../utils/route-params';

export function getShareSceneName(params: RouterParams): string {
  return getStringParam(params, 'name') ?? 'Anime scene';
}

export function getShareEpisode(params: RouterParams): string | null {
  return getStringParam(params, 'ep');
}

export function getShareMatchScore(params: RouterParams): number | null {
  const score = getNumberParam(params, 'matchScore');
  if (score === null) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Reads the frame-validity flag passed in nav params. Defaults to `null`
 * (meaning "unknown — caller passed no flag") so the ShareCard component can
 * distinguish "no flag → trust the score" from "explicitly false → suppress".
 */
export function getShareFrameValid(params: RouterParams): boolean | null {
  const raw = getStringParam(params, 'frameValid');
  if (raw === null || raw === '') return null;
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return null;
}

export function formatShareLocation(params: RouterParams): string | null {
  const lat = getNumberParam(params, 'spotLat');
  const lng = getNumberParam(params, 'spotLng');
  if (lat === null || lng === null) return null;
  return `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;
}
