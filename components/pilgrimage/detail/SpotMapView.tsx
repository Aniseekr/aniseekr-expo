// SpotMapView — the on-location pilgrimage detail map (MapLibre Native).
// Memo'd so a chip-strip selection (a root state change) doesn't churn the map.
// Markers, clustering, visited flips, heading and offline are handled natively
// by the engine behind MapSurface; this surface just normalizes the spots and
// forwards the imperative recenter/heading driven by the locate-FAB hook.

import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { useMapThemePref } from '../../../hooks/useMapThemePref';
import { resolveMapMode } from '../../../libs/services/pilgrimage/map-theme-prefs';
import { getPilgrimageSpotTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import type { LatLng } from '../../../libs/services/pilgrimage/location-service';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import type { VisitedMap } from '../../../libs/services/pilgrimage/visited-prefs';
import type { MapMarkerMode } from '../../../hooks/usePilgrimageDetailView';
import { hasValidGeo } from './_helpers';
import { MapSurface, type MapMarker, type MapSurfaceHandle } from '../map';
import { sceneMarkerToMapMarker } from '../../../libs/services/pilgrimage/map-engine/normalize';
import { CLUSTER_DISABLE_AT } from '../../../libs/services/pilgrimage/map-engine/cluster-style';
import {
  loadMapStyleOverrideSync,
  resolveMapStyleUrl,
} from '../../../libs/services/pilgrimage/map-source-prefs';

export interface SpotMapViewHandle {
  /** Pan the camera to a target location (used by the locate FAB). */
  recenter: (lat: number, lng: number, zoom?: number, opts?: { animate?: boolean }) => void;
  /** Push device heading (or null to clear) into the user puck cone. */
  setHeading: (deg: number | null) => void;
}

export interface SpotMapViewProps {
  spots: readonly AnitabiPoint[];
  visited: VisitedMap;
  ringColor: string;
  userLocation: LatLng | null;
  centerGeo: readonly [number, number] | null;
  centerZoom: number;
  markerMode: MapMarkerMode;
  offlineOnly: boolean;
  /**
   * Id of the spot currently selected in the chip strip above the map. When
   * this changes, the map pans/zooms to that spot so the chip strip doubles as
   * a quick spot picker without forcing the modal sheet open.
   */
  focusSpotId?: string | null;
  /**
   * Pixels to lift the in-map controls + attribution off the bottom edge so
   * they clear whatever floating UI sits on top of the map (bottom sheet peek,
   * tab bar, etc.). Defaults to 16 (true-fullscreen maps).
   */
  controlsBottomOffset?: number;
  onSpotPress: (spot: AnitabiPoint) => void;
  onClusterPick: (spots: readonly AnitabiPoint[]) => void;
  /** Notified the moment the user drags the map (drops follow/compass). */
  onUserPan?: () => void;
  theme: ThemePalette;
  style?: StyleProp<ViewStyle>;
}

const SpotMapViewImpl = forwardRef<SpotMapViewHandle, SpotMapViewProps>(function SpotMapViewImpl(
  {
    spots,
    visited,
    ringColor,
    userLocation,
    centerGeo,
    centerZoom,
    markerMode,
    offlineOnly,
    focusSpotId,
    controlsBottomOffset = 16,
    onSpotPress,
    onClusterPick,
    onUserPan,
    theme,
    style,
  }: SpotMapViewProps,
  ref
) {
  const { effectiveMode } = useTheme();
  const { pref: mapThemePref } = useMapThemePref();
  const mapMode = resolveMapMode(mapThemePref, effectiveMode);
  const styleUrl = resolveMapStyleUrl(mapMode, loadMapStyleOverrideSync());

  const maplibreRef = useRef<MapSurfaceHandle>(null);
  const spotsById = useRef(new Map<string, AnitabiPoint>());
  const styles = useMemo(() => makeMapStyles(theme), [theme]);

  // Engine-neutral scene markers. `spotsById` is (re)populated here so marker /
  // cluster taps resolve back to the source AnitabiPoint.
  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    spotsById.current.clear();
    for (const spot of spots) {
      if (!hasValidGeo(spot.geo)) continue;
      spotsById.current.set(spot.id, spot);
      out.push(
        sceneMarkerToMapMarker({
          id: spot.id,
          lat: spot.geo[0],
          lng: spot.geo[1],
          title: getPilgrimageSpotTitles(spot).primary,
          image: spot.image ?? '',
          ep: spot.ep,
          ringColor,
          visited: visited[spot.id] === true,
          markerMode: markerMode === 'dot' ? 'dot' : 'bubble',
        })
      );
    }
    return out;
  }, [spots, ringColor, markerMode, visited]);

  // Chip-strip selection pans to the focused spot (native flyTo, zoom 16).
  useEffect(() => {
    if (!focusSpotId) return;
    const spot = spotsById.current.get(focusSpotId);
    if (!spot || !hasValidGeo(spot.geo)) return;
    maplibreRef.current?.focus?.({ lat: spot.geo[0], lng: spot.geo[1], zoom: 16 });
  }, [focusSpotId]);

  // Imperative recenter / heading — driven by the locate-FAB hook so location +
  // 60 Hz magnetometer ticks bypass React state entirely (CLAUDE.md Rule 9).
  useImperativeHandle(
    ref,
    () => ({
      recenter: (lat, lng, zoom, opts) => maplibreRef.current?.recenter(lat, lng, zoom, opts),
      setHeading: (deg) => maplibreRef.current?.setHeading(deg),
    }),
    []
  );

  const user = userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : null;
  const center =
    centerGeo && hasValidGeo(centerGeo) ? { lat: centerGeo[0], lng: centerGeo[1] } : undefined;

  return (
    <View style={[styles.container, style]} testID="pilgrimage-spot-map">
      <MapSurface
        ref={maplibreRef}
        markers={markers}
        styleUrl={styleUrl}
        user={user}
        center={center}
        zoom={centerZoom}
        markerMode={markerMode === 'dot' ? 'dot' : 'bubble'}
        clusterDisableAtZoom={CLUSTER_DISABLE_AT.spot}
        offlineOnly={offlineOnly}
        controlsBottomOffset={controlsBottomOffset}
        onMarkerPress={(m) => {
          const spot = spotsById.current.get(m.id);
          if (spot) onSpotPress(spot);
        }}
        onClusterPress={(picked) => {
          const spotsPicked: AnitabiPoint[] = [];
          for (const m of picked) {
            const s = spotsById.current.get(m.id);
            if (s) spotsPicked.push(s);
          }
          if (spotsPicked.length > 0) onClusterPick(spotsPicked);
        }}
        onPanned={onUserPan}
      />
    </View>
  );
});

function areEqual(prev: SpotMapViewProps, next: SpotMapViewProps): boolean {
  return (
    prev.spots === next.spots &&
    prev.visited === next.visited &&
    prev.ringColor === next.ringColor &&
    prev.userLocation === next.userLocation &&
    prev.centerGeo === next.centerGeo &&
    prev.centerZoom === next.centerZoom &&
    prev.markerMode === next.markerMode &&
    prev.offlineOnly === next.offlineOnly &&
    prev.focusSpotId === next.focusSpotId &&
    prev.controlsBottomOffset === next.controlsBottomOffset &&
    prev.onSpotPress === next.onSpotPress &&
    prev.onClusterPick === next.onClusterPick &&
    prev.onUserPan === next.onUserPan &&
    prev.theme === next.theme &&
    prev.style === next.style
  );
}

export const SpotMapView = memo(SpotMapViewImpl, areEqual);

function makeMapStyles(theme: ThemePalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
    },
  });
}
