// Per-kind marker visual spec, ported from the Leaflet divIcon HTML in
// SpotMapView (spot bubble/dot, EP badge, visited flip) and HubMapWebView (anime
// balloon + points badge, Tourism-88 gold pin + star + #id). Pure resolver so the
// MapLibre NativeMapMarker renders identical geometry without a native render.
import type { MapMarker, MapMarkerMode } from './types';

/** Leaflet visited-state green (border/tail/badge turn this colour). */
export const VISITED_COLOR = '#34A853';

export type MarkerShape = 'balloon' | 'dot' | 'gold88';

export interface MarkerBadge {
  text: string;
  /** `ep` = spot episode, `pts` = anime points count, `id88` = Tourism-88 id. */
  kind: 'ep' | 'pts' | 'id88';
}

/** MapLibre `<Marker anchor>` value: which point of the view sits on the coord. */
export type MarkerAnchor = 'bottom' | 'center';

export interface MarkerVisual {
  shape: MarkerShape;
  width: number;
  height: number;
  /** 'bottom' = tail tip on the coord (balloon/pin); 'center' = dot centred. */
  anchor: MarkerAnchor;
  ringColor: string;
  visited: boolean;
  badge: MarkerBadge | null;
  showStar: boolean;
}

// iconSize/iconAnchor from the Leaflet markers ([48,57]@[24,57], [24,24]@[12,12],
// [36,45]@[18,45]) → MapLibre string anchors.
const BALLOON = { width: 48, height: 57, anchor: 'bottom' as const };
const DOT = { width: 24, height: 24, anchor: 'center' as const };
const GOLD88 = { width: 36, height: 45, anchor: 'bottom' as const };

/**
 * Resolve a neutral marker to its on-map visual. `defaultMode` is the surface's
 * fallback bubble/dot for spot markers that don't carry their own `markerMode`.
 */
export function resolveMarkerVisual(
  m: MapMarker,
  defaultMode: MapMarkerMode = 'bubble'
): MarkerVisual {
  if (m.kind === 'city88') {
    return {
      shape: 'gold88',
      ...GOLD88,
      ringColor: m.color,
      visited: false,
      badge: m.eightyEightId != null ? { text: `#${m.eightyEightId}`, kind: 'id88' } : null,
      showStar: true,
    };
  }

  if (m.kind === 'spot') {
    const mode = m.markerMode ?? defaultMode;
    if (mode === 'dot') {
      return {
        shape: 'dot',
        ...DOT,
        ringColor: m.color,
        visited: !!m.visited,
        badge: null,
        showStar: false,
      };
    }
    return {
      shape: 'balloon',
      ...BALLOON,
      ringColor: m.color,
      visited: !!m.visited,
      badge: m.episode != null ? { text: `EP ${m.episode}`, kind: 'ep' } : null,
      showStar: false,
    };
  }

  // anime centroid balloon
  return {
    shape: 'balloon',
    ...BALLOON,
    ringColor: m.color,
    visited: false,
    badge: m.pointsLength != null ? { text: String(m.pointsLength), kind: 'pts' } : null,
    showStar: false,
  };
}
