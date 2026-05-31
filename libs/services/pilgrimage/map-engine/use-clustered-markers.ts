// JS clustering for the MapLibre engine via supercluster. GL clustering can't
// host view-based rich markers, so we cluster in JS and render clusters + leaves
// as <Marker> views — supercluster bounds the on-screen view count to the
// viewport. The pure builders below are unit-tested; the hook is a thin memo.
import { useMemo } from 'react';
import Supercluster from 'supercluster';

import type { BBox, MapMarker } from './types';
import { markersToFeatureCollection } from './feature-collection';
import { CLUSTER_RADIUS_PX, dominantColor } from './cluster-style';
import { bboxToBounds } from './viewport';

/** Leaflet's default ring colour, used when a cluster has no colour tally. */
const FALLBACK_COLOR = '#FF9F0A';

type LeafProps = { id: string; kind: string; color: string; visited: number };
type ClusterAgg = { colorTally: Record<string, number> };

export interface ClusterViewport {
  zoom: number;
  bbox: BBox | null;
}

export interface RenderedLeaf {
  type: 'leaf';
  id: string;
  lat: number;
  lng: number;
}
export interface RenderedCluster {
  type: 'cluster';
  clusterId: number;
  lat: number;
  lng: number;
  count: number;
  color: string;
}
export type RenderedClusterItem = RenderedLeaf | RenderedCluster;

/** Build a supercluster index. `map`/`reduce` accumulate a per-cluster colour tally. */
export function buildClusterIndex(
  markers: readonly MapMarker[],
  radius: number = CLUSTER_RADIUS_PX,
  maxZoom = 16
): Supercluster<LeafProps, ClusterAgg> {
  const index = new Supercluster<LeafProps, ClusterAgg>({
    radius,
    maxZoom,
    map: (props) => ({ colorTally: { [props.color]: 1 } }),
    reduce: (acc, props) => {
      for (const c in props.colorTally) {
        acc.colorTally[c] = (acc.colorTally[c] ?? 0) + props.colorTally[c];
      }
    },
  });
  const fc = markersToFeatureCollection(markers);
  index.load(fc.features as Supercluster.PointFeature<LeafProps>[]);
  return index;
}

/** Clusters + unclustered leaves visible in the current viewport. */
export function clusterItemsFor(
  index: Supercluster<LeafProps, ClusterAgg>,
  viewport: ClusterViewport
): RenderedClusterItem[] {
  if (!viewport.bbox) return [];
  const zoom = Math.max(0, Math.round(viewport.zoom));
  return index.getClusters(bboxToBounds(viewport.bbox), zoom).map((f) => {
    const [lng, lat] = f.geometry.coordinates;
    const props = f.properties;
    if ('cluster' in props && props.cluster) {
      return {
        type: 'cluster',
        clusterId: props.cluster_id,
        lat,
        lng,
        count: props.point_count,
        color: dominantColor(props.colorTally ?? {}, FALLBACK_COLOR),
      };
    }
    return { type: 'leaf', id: (props as LeafProps).id, lat, lng };
  });
}

/** Every member of a cluster (id + coord), for the picker sheet / fit-bounds. */
export function clusterLeaves(
  index: Supercluster<LeafProps, ClusterAgg>,
  clusterId: number
): Array<{ id: string; lat: number; lng: number }> {
  return index.getLeaves(clusterId, Infinity).map((f) => ({
    id: f.properties.id,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
  }));
}

/** Memoised clustering for the engine: rebuilds the index on marker change, the
 *  item list on viewport change. */
export function useClusteredMarkers(
  markers: readonly MapMarker[],
  viewport: ClusterViewport,
  opts?: { radius?: number; maxZoom?: number }
): { index: Supercluster<LeafProps, ClusterAgg>; items: RenderedClusterItem[] } {
  const radius = opts?.radius ?? CLUSTER_RADIUS_PX;
  const maxZoom = opts?.maxZoom ?? 16;
  const index = useMemo(() => buildClusterIndex(markers, radius, maxZoom), [markers, radius, maxZoom]);
  const items = useMemo(
    () => clusterItemsFor(index, viewport),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, viewport.zoom, viewport.bbox]
  );
  return { index, items };
}
