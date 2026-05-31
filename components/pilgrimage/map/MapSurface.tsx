// The engine-neutral map surface the three pilgrimage screens render.
//
// Dispatches to the MapLibre engine when the rollout flag is 'maplibre',
// otherwise renders the screen's existing Leaflet surface (`leafletFallback`).
// This lets each screen adopt MapSurface incrementally — pass the neutral props
// + your current Leaflet component as the fallback, and flipping the flag (after
// the on-device spike) is all it takes to switch that surface to MapLibre.
import { forwardRef } from 'react';
import type { ReactNode } from 'react';

import type {
  MapEngineId,
  MapSurfaceHandle,
  MapSurfaceProps,
} from '../../../libs/services/pilgrimage/map-engine/types';
import { MapLibreEngine } from './engines/MapLibreEngine';

export interface MapSurfaceComponentProps extends MapSurfaceProps {
  /** Which renderer to use (read from `map-engine-prefs` by the caller). */
  engine: MapEngineId;
  /** The screen's existing Leaflet surface, rendered while `engine === 'leaflet'`. */
  leafletFallback?: ReactNode;
}

export const MapSurface = forwardRef<MapSurfaceHandle, MapSurfaceComponentProps>(
  function MapSurface({ engine, leafletFallback, ...props }, ref) {
    if (engine === 'maplibre') {
      return <MapLibreEngine ref={ref} {...props} />;
    }
    return <>{leafletFallback ?? null}</>;
  }
);
