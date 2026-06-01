// Hub anime-balloon / Tourism-88 marker shape + region bounding box.
//
// Re-homed out of the deleted Leaflet WebView so the engine-neutral layer
// (`normalize.ts`) no longer imports from a concrete map component. Pure types,
// no runtime.

export interface HubMapMarker {
  /** Unique within a marker set: "bgm:<id>" for Anitabi-centroid markers, "88:<entryId>" for Tourism 88 city pins. */
  markerId: string;
  bangumiId: number;
  lat: number;
  lng: number;
  cover: string;
  title: string;
  city: string;
  pointsLength: number;
  ringColor: string;
  /** Set when this marker is a Tourism 88 city pin; renders gold with a star overlay. */
  is88?: boolean;
  /** Sequential 88 list id (1..N). Surfaced in the popup. */
  eightyEightId?: number;
}

// Geographic bounding box used by the camera-fly request. Shared with the hub
// screen, which builds the per-region boxes (REGION_BOUNDS / JAPAN_BOUNDS).
export interface RegionBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}
