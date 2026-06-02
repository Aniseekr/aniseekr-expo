// The map surface the pilgrimage screens render — a thin, stable handle over the
// single MapLibre engine. The dual-engine rollout switch (engine flag + Leaflet
// fallback + delegating handle) was removed once Leaflet was deleted; this
// indirection just keeps the screens decoupled from the concrete engine.
import type { Ref } from 'react';

import type {
  MapSurfaceHandle,
  MapSurfaceProps,
} from '../../../libs/services/pilgrimage/map-engine/types';
import { MapLibreEngine } from './engines/MapLibreEngine';

/** Public prop name kept stable for call sites; identical to MapSurfaceProps. */
export type MapSurfaceComponentProps = MapSurfaceProps;

export function MapSurface({ ref, ...props }: MapSurfaceProps & { ref?: Ref<MapSurfaceHandle> }) {
  return <MapLibreEngine ref={ref} {...props} />;
}
