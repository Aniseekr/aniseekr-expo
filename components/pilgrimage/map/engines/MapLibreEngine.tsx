// MapLibre Native engine for the pilgrimage map (migration spec §4.2, D1/D3).
//
// STATUS: type-correct spike, device-render UNVERIFIED. This compiles + lints
// here, but MapLibre is a native module — it cannot render in a headless/CI
// environment. It must be validated on a prebuilt dev client (spec §15, the P1
// gating spike). It is reached only when the engine flag is flipped to
// 'maplibre' (default is 'leaflet'); the shipping app is unaffected until then.
//
// Scope of this spike: prove the map renders with our source, shows markers,
// the user puck, and that the imperative handle drives the camera. The full
// per-kind rendering (anime balloons, gold 88 pins, spot bubble/dot, visited
// flips, cluster picker) is deliberately deferred to post-spike — markers here
// render as colour-coded circles via a clustered GeoJSON source.
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Map as MapLibreMap,
  Camera,
  GeoJSONSource,
  Layer,
  UserLocation,
  type CameraRef,
  type MapRef,
} from '@maplibre/maplibre-react-native';

import type {
  MapMarker,
  MapSurfaceHandle,
  MapSurfaceProps,
} from '../../../../libs/services/pilgrimage/map-engine/types';
import { resolveMapStyleUrl } from '../../../../libs/services/pilgrimage/map-source-prefs';

const MARKER_SOURCE_ID = 'pilgrimage-markers';
/** Whole-Japan overview as [lng, lat] (MapLibre uses lng-first coordinates). */
const DEFAULT_CENTER: [number, number] = [138.0, 36.5];

/** Neutral markers → a GeoJSON FeatureCollection the source/layer can render. */
function toFeatureCollection(markers: readonly MapMarker[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: markers.map((m) => ({
      type: 'Feature',
      id: m.id,
      properties: { id: m.id, kind: m.kind, color: m.color, visited: m.visited ? 1 : 0 },
      geometry: { type: 'Point', coordinates: [m.lng, m.lat] },
    })),
  };
}

export const MapLibreEngine = forwardRef<MapSurfaceHandle, MapSurfaceProps>(function MapLibreEngine(
  { markers, user, center, zoom = 5, styleUrl, onMarkerPress, onPanned },
  ref
) {
  const cameraRef = useRef<CameraRef>(null);
  const mapRef = useRef<MapRef>(null);

  const byId = useMemo(() => {
    const map = new Map<string, MapMarker>();
    markers.forEach((m) => map.set(m.id, m));
    return map;
  }, [markers]);
  const shape = useMemo(() => toFeatureCollection(markers), [markers]);
  const styleURL = styleUrl ?? resolveMapStyleUrl('light', null);
  const initialCenter: [number, number] = center ? [center.lng, center.lat] : DEFAULT_CENTER;

  useImperativeHandle(
    ref,
    () => ({
      recenter: (lat, lng, z, opts) =>
        cameraRef.current?.easeTo({
          center: [lng, lat],
          zoom: z,
          duration: opts?.animate === false ? 0 : 500,
        }),
      // No-op: <UserLocation heading> renders the device-heading arrow
      // natively, so the manual heading push the Leaflet path needed is
      // unnecessary. Reserved for a future custom puck.
      setHeading: () => {},
      focus: (target) =>
        cameraRef.current?.flyTo({ center: [target.lng, target.lat], zoom: target.zoom }),
    }),
    []
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapLibreMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapStyle={styleURL}
        onRegionWillChange={() => onPanned?.()}>
        <Camera ref={cameraRef} center={initialCenter} zoom={zoom} />
        <GeoJSONSource
          id={MARKER_SOURCE_ID}
          data={shape}
          cluster
          clusterRadius={48}
          onPress={(event) => {
            const id = event.nativeEvent?.features?.[0]?.properties?.id as string | undefined;
            const marker = id ? byId.get(id) : undefined;
            if (marker) onMarkerPress?.(marker);
          }}>
          <Layer
            id={`${MARKER_SOURCE_ID}-circle`}
            type="circle"
            style={{
              circleRadius: 7,
              circleColor: ['get', 'color'],
              circleStrokeWidth: 2,
              circleStrokeColor: '#FFFFFF',
            }}
          />
        </GeoJSONSource>
        {user ? <UserLocation heading accuracy /> : null}
      </MapLibreMap>
    </View>
  );
});
