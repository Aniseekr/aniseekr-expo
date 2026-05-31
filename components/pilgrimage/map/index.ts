// Public surface for the engine-neutral pilgrimage map layer.
export { MapSurface, type MapSurfaceComponentProps } from './MapSurface';
export { MapLibreEngine } from './engines/MapLibreEngine';
export type {
  MapMarker,
  MapMarkerKind,
  MapMarkerMode,
  MapRoute,
  MapWaypoint,
  UserPuck,
  BBox,
  LatLng,
  Viewport,
  MapEngineId,
  MapSurfaceHandle,
  MapSurfaceProps,
} from '../../../libs/services/pilgrimage/map-engine/types';
