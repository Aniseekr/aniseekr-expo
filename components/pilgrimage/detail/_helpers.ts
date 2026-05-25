// Shared helpers used by the pilgrimage detail leaf components. These are
// the small pure functions formerly inlined at the top of
// `app/(tabs)/pilgrimage/[animeId].tsx`. Moving them out of the route file
// lets the leaf components import once instead of routing back through the
// 3.8k-line root.

import { Platform } from 'react-native';
import type { PlatformType } from '../../../libs/services/auth/types';
import type {
  AnitabiPoint,
} from '../../../libs/services/pilgrimage/types';
import type { PilgrimageSeriesPoint } from '../../../libs/services/pilgrimage/pilgrimage-series';

// Use the `www.` subdomain for all anitabi.cn links. The apex domain issues a
// 301 redirect that silently STRIPS the `/map` segment from the path
// (`anitabi.cn/map?bangumiId=297` → `www.anitabi.cn/?bangumiId=297`), which
// drops users onto the homepage instead of the anime map. Hitting `www.`
// directly returns 200 with the map preserved.
const ANITABI_BASE_PAGE = 'https://www.anitabi.cn/bangumi/';
const ANITABI_MAP_PAGE = 'https://www.anitabi.cn/map?bangumiId=';
const ANITABI_SITE_HOME = 'https://www.anitabi.cn/';

/**
 * URL of the Anitabi web map for a given anime — the entry point we link
 * users to when they want to see every landmark (more than we fetch via the
 * /points API), or to contribute a new spot by clicking an empty coordinate.
 */
export function buildAnitabiMapUrl(bangumiId: number): string {
  return `${ANITABI_MAP_PAGE}${bangumiId}`;
}

/** URL of the Anitabi homepage — used for the global "data by Anitabi" credit. */
export function getAnitabiSiteUrl(): string {
  return ANITABI_SITE_HOME;
}

export function buildMapsURL(lat: number, lng: number, name?: string): string {
  const encoded = name ? encodeURIComponent(name) : '';
  if (Platform.OS === 'ios') {
    const q = encoded ? `&q=${encoded}` : '';
    return `https://maps.apple.com/?ll=${lat},${lng}${q}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function hasValidGeo(geo: readonly [number, number] | null | undefined): boolean {
  if (!geo || geo.length < 2) return false;
  const [lat, lng] = geo;
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

export function formatDistanceKm(km: number): string {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function chunkPairs<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}

export function buildBrowseUrl(platform: PlatformType, bangumiId: number): string | null {
  if (platform === 'bangumi') return `https://bgm.tv/subject/${bangumiId}`;
  return `${ANITABI_BASE_PAGE}${bangumiId}`;
}

export function getPointSourceBangumiId(point: AnitabiPoint): number | null {
  const source = (point as Partial<PilgrimageSeriesPoint>).sourceBangumiId;
  return typeof source === 'number' && Number.isFinite(source) && source > 0 ? source : null;
}

export function getPointSourceLabel(point: AnitabiPoint): string | null {
  const label = (point as Partial<PilgrimageSeriesPoint>).sourceLabel;
  return typeof label === 'string' && label.length > 0 ? label : null;
}
