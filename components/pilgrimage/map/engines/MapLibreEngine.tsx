// MapLibre Native engine for the pilgrimage map (migration spec §4.2, D1/D3) —
// the single runtime engine that replaces Leaflet across all surfaces.
//
// Renders full Leaflet parity from the engine-neutral model: per-kind rich
// markers (anime balloon, Tourism-88 gold pin, spot bubble/dot, visited flip)
// via view-based <Marker>s, JS clustering (supercluster) with dot/numbered
// bubbles + multi-id cluster picker, a heading-cone user puck, plus the
// imperative handle (recenter/focus/fitBounds/setHeading/updateVisited) and
// onPanned/onBoundsChange. The parity *logic* lives in unit-tested helpers
// (marker-style, cluster-style, viewport, use-clustered-markers); this file is
// the native glue.
//
// STATUS: device-render is the one remaining gate — MapLibre is a native module
// that cannot render headlessly (spec §15). Validate on a prebuilt dev client.
//
// Offline: MapLibre's automatic ambient cache reproduces Leaflet's
// cache-as-you-browse; explicit `offlineOnly` / per-region `createPack` UX is
// reserved (spec P3), so `offlineOnly` is accepted but not yet enforced here.
import { useCallback, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Map as MapLibreMap,
  Camera,
  Marker,
  type CameraRef,
  type MapRef,
} from '@maplibre/maplibre-react-native';

import type {
  BBox,
  MapMarker,
  MapSurfaceHandle,
  MapSurfaceProps,
} from '../../../../libs/services/pilgrimage/map-engine/types';
import { resolveMapStyleUrl } from '../../../../libs/services/pilgrimage/map-source-prefs';
import { resolveMarkerVisual } from '../../../../libs/services/pilgrimage/map-engine/marker-style';
import {
  CLUSTER_DISABLE_AT,
  clusterMaxZoom,
  clusterTapAction,
} from '../../../../libs/services/pilgrimage/map-engine/cluster-style';
import {
  bboxToBounds,
  boundsToBBox,
  leavesToBBox,
} from '../../../../libs/services/pilgrimage/map-engine/viewport';
import {
  clusterLeaves,
  useClusteredMarkers,
  type ClusterViewport,
} from '../../../../libs/services/pilgrimage/map-engine/use-clustered-markers';
import { NativeMapMarker } from './markers/NativeMapMarker';
import { ClusterBubble } from './markers/ClusterBubble';
import { UserPuck } from './markers/UserPuck';

/** Whole-Japan overview as [lng, lat] (MapLibre uses lng-first coordinates). */
const DEFAULT_CENTER: [number, number] = [138.0, 36.5];
/** Recompute clusters + emit bounds only on settle, not per frame (Rule 9). */
const BOUNDS_DEBOUNCE_MS = 300;

export function MapLibreEngine({
  markers,
  user,
  center,
  zoom = 5,
  markerMode = 'bubble',
  visitedIds,
  clusterDisableAtZoom = CLUSTER_DISABLE_AT.default,
  styleUrl,
  controlsBottomOffset = 0,
  onMarkerPress,
  onClusterPress,
  onPanned,
  onBoundsChange,
  ref,
}: MapSurfaceProps & { ref?: Ref<MapSurfaceHandle> }) {
  const cameraRef = useRef<CameraRef>(null);
  const mapRef = useRef<MapRef>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Coarse, settle-time viewport (zoom + bbox): drives clustering + bounds emit.
  const [viewport, setViewport] = useState<ClusterViewport>({ zoom, bbox: null });
  // Imperative heading (compass cone) + visited override — kept off props/render
  // path so the locate FAB and visited toggles don't churn the parent (Rule 9).
  const [heading, setHeadingState] = useState<number | null>(user?.heading ?? null);
  const [visitedOverride, setVisitedOverride] = useState<readonly string[] | null>(null);

  const byId = useMemo(() => {
    const map = new Map<string, MapMarker>();
    markers.forEach((m) => map.set(m.id, m));
    return map;
  }, [markers]);

  // updateVisited(ids) / visitedIds prop flip a spot marker's visited flag
  // without rebuilding the whole source.
  const effectiveMarkers = useMemo(() => {
    const ids = visitedOverride ?? visitedIds;
    if (!ids) return markers;
    const set = new Set(ids);
    return markers.map((m) => (m.kind === 'spot' ? { ...m, visited: set.has(m.id) } : m));
  }, [markers, visitedIds, visitedOverride]);

  const { index, items } = useClusteredMarkers(effectiveMarkers, viewport, {
    maxZoom: clusterMaxZoom(clusterDisableAtZoom),
  });

  const styleURL = styleUrl ?? resolveMapStyleUrl('light', null);
  const initialCenter: [number, number] = center ? [center.lng, center.lat] : DEFAULT_CENTER;

  const refreshViewport = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    try {
      const [z, bounds] = await Promise.all([map.getZoom(), map.getBounds()]);
      const box = boundsToBBox(bounds);
      setViewport({ zoom: z, bbox: box });
      onBoundsChange?.(box);
    } catch {
      // Map torn down between the event and the async read — ignore.
    }
  }, [onBoundsChange]);

  const scheduleViewportRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void refreshViewport(), BOUNDS_DEBOUNCE_MS);
  }, [refreshViewport]);

  const fitBox = useCallback((box: BBox, animate: boolean) => {
    cameraRef.current?.fitBounds(bboxToBounds(box), { duration: animate ? 400 : 0 });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      recenter: (lat, lng, z, opts) =>
        cameraRef.current?.easeTo({
          center: [lng, lat],
          zoom: z,
          duration: opts?.animate === false ? 0 : 500,
        }),
      setHeading: (deg) => setHeadingState(deg),
      focus: (target) =>
        cameraRef.current?.flyTo({ center: [target.lng, target.lat], zoom: target.zoom }),
      fitBounds: (box, opts) => fitBox(box, opts?.animate !== false),
      updateVisited: (ids) => setVisitedOverride(ids),
    }),
    [fitBox]
  );

  const handleClusterPress = useCallback(
    (clusterId: number, count: number) => {
      const leaves = clusterLeaves(index, clusterId);
      // Big cluster → zoom to fit its members; small → hand the picker its markers.
      if (clusterTapAction(count) === 'zoom') {
        const box = leavesToBBox(leaves);
        if (box) fitBox(box, true);
        return;
      }
      const picked = leaves.map((l) => byId.get(l.id)).filter((m): m is MapMarker => m != null);
      if (picked.length) onClusterPress?.(picked);
    },
    [index, byId, onClusterPress, fitBox]
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapLibreMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapStyle={styleURL}
        attributionPosition={{ bottom: 8 + controlsBottomOffset, right: 8 }}
        logoPosition={{ bottom: 8 + controlsBottomOffset, left: 8 }}
        onRegionWillChange={(e) => {
          // Only a genuine drag/pinch drops follow/compass — not our easeTo/flyTo.
          if (e.nativeEvent.userInteraction) onPanned?.();
        }}
        onRegionDidChange={scheduleViewportRefresh}
        onDidFinishLoadingMap={() => void refreshViewport()}>
        {/* initialViewState applies once; later moves go through the handle so
            marker/user re-renders never snap the viewport back (Rule 9). */}
        <Camera ref={cameraRef} initialViewState={{ center: initialCenter, zoom }} />
        {items.map((it) => {
          if (it.type === 'cluster') {
            return (
              <Marker key={`c:${it.clusterId}`} lngLat={[it.lng, it.lat]} anchor="center">
                <ClusterBubble
                  count={it.count}
                  color={it.color}
                  zoom={viewport.zoom}
                  onPress={() => handleClusterPress(it.clusterId, it.count)}
                />
              </Marker>
            );
          }
          const m = byId.get(it.id);
          if (!m) return null;
          return (
            <Marker
              key={`m:${it.id}`}
              lngLat={[it.lng, it.lat]}
              anchor={resolveMarkerVisual(m, markerMode).anchor}>
              <NativeMapMarker marker={m} defaultMode={markerMode} onPress={onMarkerPress} />
            </Marker>
          );
        })}
        {user ? (
          <Marker lngLat={[user.lng, user.lat]} anchor="center">
            <UserPuck heading={heading} />
          </Marker>
        ) : null}
      </MapLibreMap>
    </View>
  );
}
