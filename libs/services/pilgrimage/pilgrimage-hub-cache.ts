import type { LatLng } from './location-service';
import type { AnitabiBangumi } from './types';
import type { VisitedMap } from './visited-prefs';

export const PILGRIMAGE_HUB_SNAPSHOT_TTL_MS = 5 * 60 * 1000;

export interface PilgrimageHubSnapshot {
  collectionAnimes?: AnitabiBangumi[];
  featuredAnimes?: AnitabiBangumi[];
  visited?: VisitedMap;
  userLocation?: LatLng | null;
  updatedAt: number;
}

type SnapshotPatch = Partial<Omit<PilgrimageHubSnapshot, 'updatedAt'>>;

let snapshot: PilgrimageHubSnapshot | null = null;
let now = () => Date.now();

export function getPilgrimageHubSnapshot(
  maxAgeMs: number = PILGRIMAGE_HUB_SNAPSHOT_TTL_MS
): PilgrimageHubSnapshot | null {
  if (!snapshot) return null;
  if (maxAgeMs >= 0 && now() - snapshot.updatedAt > maxAgeMs) return null;
  return cloneSnapshot(snapshot);
}

export function updatePilgrimageHubSnapshot(patch: SnapshotPatch): void {
  const base = snapshot ? cloneSnapshot(snapshot) : { updatedAt: now() };

  if (Object.prototype.hasOwnProperty.call(patch, 'collectionAnimes')) {
    base.collectionAnimes = [...(patch.collectionAnimes ?? [])];
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'featuredAnimes')) {
    base.featuredAnimes = [...(patch.featuredAnimes ?? [])];
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'visited')) {
    base.visited = { ...(patch.visited ?? {}) };
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'userLocation')) {
    base.userLocation = patch.userLocation ? { ...patch.userLocation } : null;
  }

  base.updatedAt = now();
  snapshot = base;
}

export function __resetPilgrimageHubCacheForTests(nowFn: () => number = () => Date.now()): void {
  snapshot = null;
  now = nowFn;
}

function cloneSnapshot(source: PilgrimageHubSnapshot): PilgrimageHubSnapshot {
  const copy: PilgrimageHubSnapshot = { updatedAt: source.updatedAt };
  if (Object.prototype.hasOwnProperty.call(source, 'collectionAnimes')) {
    copy.collectionAnimes = [...(source.collectionAnimes ?? [])];
  }
  if (Object.prototype.hasOwnProperty.call(source, 'featuredAnimes')) {
    copy.featuredAnimes = [...(source.featuredAnimes ?? [])];
  }
  if (Object.prototype.hasOwnProperty.call(source, 'visited')) {
    copy.visited = { ...(source.visited ?? {}) };
  }
  if (Object.prototype.hasOwnProperty.call(source, 'userLocation')) {
    copy.userLocation = source.userLocation ? { ...source.userLocation } : null;
  }
  return copy;
}
