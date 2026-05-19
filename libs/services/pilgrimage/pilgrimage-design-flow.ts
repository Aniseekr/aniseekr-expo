export type PilgrimageMapInitialMode = 'list' | 'map';
export interface PilgrimageMapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export function resolvePilgrimageMapInitialMode(
  raw: string | string[] | null | undefined
): PilgrimageMapInitialMode {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'list' ? 'list' : 'map';
}

export function shouldLoadPilgrimageMapBounds(bounds: PilgrimageMapBounds): boolean {
  if (
    !Number.isFinite(bounds.north) ||
    !Number.isFinite(bounds.south) ||
    !Number.isFinite(bounds.east) ||
    !Number.isFinite(bounds.west) ||
    bounds.north < bounds.south
  ) {
    return false;
  }

  const latSpan = bounds.north - bounds.south;
  const lngSpan =
    bounds.west <= bounds.east ? bounds.east - bounds.west : 360 - bounds.west + bounds.east;

  return latSpan <= 4 && lngSpan <= 5;
}
