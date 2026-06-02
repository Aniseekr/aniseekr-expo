// Offline lookup of Japanese city centroids used to drop one map pin per
// (anime × city) row in the Anime Tourism 88 dataset.
//
// Source: Nominatim (OpenStreetMap). Regenerate with
// `bun run scripts/build-jp-city-centroids.ts` after refreshing the 88
// dataset, since the unique city list is keyed off it.

export interface JpCityCentroid {
  prefecture: string;
  city: string;
  lat: number;
  lng: number;
  queryUsed: string;
  source: 'nominatim' | 'manual';
  displayName?: string;
}

interface CentroidsFile {
  generatedAt: string;
  source: string;
  count: number;
  entries: JpCityCentroid[];
  failures: { prefecture: string; city: string }[];
}

// Lazy + memoized: the 28KB centroids JSON is required and the lookup Map is
// built only on first access, not at module-eval time, to keep this ~28KB
// parse off the cold-start JS thread.
let _data: CentroidsFile | null = null;
let _index: ReadonlyMap<string, JpCityCentroid> | null = null;

function getData(): CentroidsFile {
  if (_data) return _data;
  // require (sync) so the public API stays sync on first call. Bun returns the
  // parsed object directly; bun:test mock.module wraps it in `{ default }`.
  const mod = require('./jp-city-centroids.data.json');
  _data = (mod?.default ?? mod) as CentroidsFile;
  return _data;
}

function getIndex(): ReadonlyMap<string, JpCityCentroid> {
  if (_index) return _index;
  const m = new Map<string, JpCityCentroid>();
  for (const e of getData().entries) m.set(`${e.prefecture}\t${e.city}`, e);
  _index = m;
  return _index;
}

/** Centroid for a (prefecture, city) pair, or null when not in the table. */
export function getCityCentroid(
  prefecture: string | null | undefined,
  city: string | null | undefined
): JpCityCentroid | null {
  if (!prefecture || !city) return null;
  return getIndex().get(`${prefecture}\t${city}`) ?? null;
}
