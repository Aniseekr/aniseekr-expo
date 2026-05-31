// Cluster visual rules for the MapLibre engine, ported verbatim from the Leaflet
// `__makeClusterGroup` (libs/services/pilgrimage/leaflet-map.ts). Pure functions,
// unit-tested, so the supercluster-backed bubbles match today's dot/numbered look
// and tap behaviour. (supercluster clusters with a single pixel radius rather than
// Leaflet's per-zoom curve, so CLUSTER_RADIUS_PX is one representative value; the
// dot-vs-bubble + size + label rules below are the faithful, user-visible part.)

/** Representative supercluster cluster radius in px (≈ Leaflet's 38–50 mid-zoom band). */
export const CLUSTER_RADIUS_PX = 48;

/** Clusters bigger than this open the picker sheet; bigger ones zoom in instead. */
export const CLUSTER_PICKER_THRESHOLD = 12;

/** `disableClusteringAtZoom` per surface (Leaflet defaults). */
export const CLUSTER_DISABLE_AT = { spot: 16, hub: 12, hubSpot: 15, default: 14 } as const;

/** supercluster `maxZoom` reproduces Leaflet's `disableClusteringAtZoom`. */
export function clusterMaxZoom(disableAt: number): number {
  return disableAt - 1;
}

/** Dot when zoomed out (text unreadable) or the count is uninformative. */
export function isDotCluster(zoom: number, count: number): boolean {
  return zoom <= 8 || count < 10;
}

/** Dot diameter scales with member count so dense regions still read as "more". */
export function clusterDotSize(count: number): number {
  if (count < 5) return 12;
  if (count < 25) return 16;
  if (count < 100) return 20;
  return 24;
}

/** Numbered-bubble diameter by member count. */
export function clusterBubbleSize(count: number): number {
  if (count < 50) return 34;
  if (count < 200) return 42;
  return 50;
}

/** Count label: raw below 1000, else one-decimal thousands (1234 → "1.2k"). */
export function formatClusterCount(count: number): string {
  return count >= 1000 ? `${(Math.floor(count / 100) / 10).toFixed(1)}k` : String(count);
}

/** Bubble colour = the most common region colour among members. */
export function dominantColor(tally: Record<string, number>, fallback: string): string {
  let pick = fallback;
  let pickN = 0;
  for (const color in tally) {
    if (tally[color] > pickN) {
      pick = color;
      pickN = tally[color];
    }
  }
  return pick;
}

/** A tap on a cluster: small → picker sheet, large → fly to fit its bounds. */
export function clusterTapAction(
  count: number,
  threshold: number = CLUSTER_PICKER_THRESHOLD
): 'picker' | 'zoom' {
  return count > threshold ? 'zoom' : 'picker';
}
