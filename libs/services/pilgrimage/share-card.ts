import { getNumberParam, getStringParam, type RouterParams } from '../../utils/route-params';

export function getShareSceneName(params: RouterParams): string {
  return getStringParam(params, 'name') ?? '原作場景';
}

export function getShareEpisode(params: RouterParams): string | null {
  return getStringParam(params, 'ep');
}

export function getShareMatchScore(params: RouterParams): number | null {
  const score = getNumberParam(params, 'matchScore');
  if (score === null) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function formatShareLocation(params: RouterParams): string | null {
  const lat = getNumberParam(params, 'spotLat');
  const lng = getNumberParam(params, 'spotLng');
  if (lat === null || lng === null) return null;
  return `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;
}
