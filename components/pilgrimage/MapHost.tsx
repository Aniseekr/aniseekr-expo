// Map host — keeps exactly ONE hub <MapSurface/> (the MapLibre map) alive for
// the whole pilgrimage stack so re-entering the hub re-paints instantly with a
// warm camera + tile cache instead of cold-mounting the native map each time
// (CLAUDE.md Rule 10 — cold-open feel).
//
// LAYERING: the map and the claiming screen's overlays live together in ONE
// layer ABOVE the navigator, joined by a portal, so the map is the interactive
// top layer (a surface parented behind react-native-screens can be starved of
// gestures) and the claiming screen's controls sit in the same box-none layer:
//
//   <PortalProvider>
//     {children}                          ← navigator (other pilgrimage screens)
//     <View top-layer, gated by `active`>
//       <MapSurface/>                      ← the map surface
//       <PortalHost name={MAP_PORTAL_HOST}/>  ← claiming screen's overlays land here
//     </View>
//   </PortalProvider>
//
// The hub screen claims the host on focus (teleporting its overlays into
// MAP_PORTAL_HOST via <Portal>) and releases on blur; the top layer then goes
// opacity:0 + pointerEvents:none so other pilgrimage screens show through, while
// the map stays MOUNTED so re-entry is instant. Marker/theme/camera changes flow
// through props + the imperative handle, never remounting the map.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { PortalHost, PortalProvider } from '@gorhom/portal';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { type LatLng } from '../../libs/services/pilgrimage/location-service';
import { type BoundingBox } from '../../libs/services/pilgrimage/anitabi-index';
import type {
  HubMapMarker,
  RegionBounds,
} from '../../libs/services/pilgrimage/map-engine/hub-marker';
import { MapSurface, type MapSurfaceHandle } from './map';
import { hubMarkerToMapMarker } from '../../libs/services/pilgrimage/map-engine/normalize';
import {
  loadMapStyleOverrideSync,
  resolveMapStyleUrl,
  subscribeMapStyleOverride,
} from '../../libs/services/pilgrimage/map-source-prefs';
import { resolveMapMode } from '../../libs/services/pilgrimage/map-theme-prefs';
import { useMapThemePref } from '../../hooks/useMapThemePref';
import { CLUSTER_DISABLE_AT } from '../../libs/services/pilgrimage/map-engine/cluster-style';

// Portal host id — the claiming screen teleports its overlays here (via
// <Portal hostName={MAP_PORTAL_HOST}>) so they render in the SAME layer as the
// kept-alive WebView, above the navigator. See the layering note at the top.
export const MAP_PORTAL_HOST = 'pilgrimage-map';

// The prop-shaped half of HubMapWebView's inputs (everything that is data, not
// a callback). The claiming screen owns these and pushes them via claim/update.
export interface MapHostConfig {
  markers: readonly HubMapMarker[];
  replaceKey: string;
  userLocation: LatLng | null;
  ringColor: string;
  theme: ThemePalette;
  focusBangumiId: number | null;
  flyBoundsRequest: { key: string; bounds: RegionBounds } | null;
}

// The callback half. Stored in a ref so the claiming screen can pass fresh
// useCallback identities without forcing the host's WebView wrapper to
// re-create handlers (and never causing a remount of the WebView itself).
export interface MapHostHandlers {
  onAnimePress: (bangumiId: number) => void;
  onBoundsChange: (bounds: BoundingBox) => void;
  onUserPan: () => void;
}

export interface MapHostClaim extends MapHostConfig, MapHostHandlers {}

export interface MapHostContextValue {
  /** Take ownership: mark active, install the full config + handlers. */
  claim: (claim: MapHostClaim) => void;
  /** Merge a partial config into the live one (markers/theme/camera/etc.). */
  update: (partial: Partial<MapHostConfig>) => void;
  /** Give up ownership. The WebView stays mounted so re-claim is instant. */
  release: () => void;
  /** Imperative camera recenter — forwarded to the live HubMapWebView handle. */
  recenter: (
    lat: number,
    lng: number,
    zoom?: number,
    opts?: { animate?: boolean }
  ) => void;
  /** Push the device heading (or null to clear the cone) into the WebView. */
  setHeading: (deg: number | null) => void;
}

const MapHostContext = createContext<MapHostContextValue | null>(null);

export function useMapHost(): MapHostContextValue {
  const ctx = useContext(MapHostContext);
  if (!ctx) {
    throw new Error('useMapHost must be used within <MapHostProvider>');
  }
  return ctx;
}

export function MapHostProvider({ children }: { children: React.ReactNode }) {
  // App-level theme used only while UNCLAIMED, so the host still pre-warms
  // tiles with sane chrome. Once a screen claims, its own theme is pushed
  // through config.theme (the provider can't know the claiming screen's theme).
  const { theme: appTheme, effectiveMode } = useTheme();
  const { pref: mapThemePref } = useMapThemePref();

  // Resolved MapLibre style URL (D7 seam) — mirrors each surface's resolution so
  // the hub honours the user's map-theme pref + source override.
  const [styleOverride, setStyleOverride] = useState(loadMapStyleOverrideSync);
  useEffect(() => subscribeMapStyleOverride(setStyleOverride), []);
  const styleUrl = resolveMapStyleUrl(resolveMapMode(mapThemePref, effectiveMode), styleOverride);

  // claim/recenter/setHeading drive the live MapSurface camera handle.
  const hostRef = useRef<MapSurfaceHandle>(null);

  // active=false → unclaimed (empty markers, app theme). We keep config in a
  // single state object so a claim/update is one setState and one re-render;
  // HubMapWebView only re-injects from it, never remounts.
  const [state, setState] = useState<{ active: boolean; config: MapHostConfig }>(
    () => ({
      active: false,
      config: {
        markers: [],
        replaceKey: 'idle',
        userLocation: null,
        ringColor: appTheme.accent,
        theme: appTheme,
        focusBangumiId: null,
        flyBoundsRequest: null,
      },
    })
  );

  // Handlers in a ref: the host's WebView props read from these via stable
  // wrappers below, so swapping in fresh useCallback identities from the
  // claiming screen never re-creates the WebView's own handler props.
  const handlersRef = useRef<MapHostHandlers>({
    onAnimePress: () => undefined,
    onBoundsChange: () => undefined,
    onUserPan: () => undefined,
  });

  const claim = useCallback((claimArgs: MapHostClaim) => {
    const { onAnimePress, onBoundsChange, onUserPan, ...config } = claimArgs;
    handlersRef.current = { onAnimePress, onBoundsChange, onUserPan };
    setState({ active: true, config });
  }, []);

  const update = useCallback((partial: Partial<MapHostConfig>) => {
    setState((prev) => {
      // Only the claiming screen drives updates; ignore stale updates that land
      // after release so a blurred screen can't repaint the idle host.
      if (!prev.active) return prev;
      // Skip no-op writes (e.g. the update effect firing on the same commit as
      // claim) so the provider doesn't re-render with an identical config.
      let changed = false;
      for (const k of Object.keys(partial) as (keyof MapHostConfig)[]) {
        if (prev.config[k] !== partial[k]) {
          changed = true;
          break;
        }
      }
      if (!changed) return prev;
      return { active: true, config: { ...prev.config, ...partial } };
    });
  }, []);

  const release = useCallback(() => {
    // Keep markers/camera so re-claim is instant — just drop the active flag.
    setState((prev) => (prev.active ? { ...prev, active: false } : prev));
  }, []);

  const recenter = useCallback<MapHostContextValue['recenter']>(
    (lat, lng, zoom, opts) => {
      hostRef.current?.recenter(lat, lng, zoom, opts);
    },
    []
  );

  const setHeading = useCallback<MapHostContextValue['setHeading']>((deg) => {
    hostRef.current?.setHeading(deg);
  }, []);

  // Stable wrappers — read the latest handler from the ref so the WebView's
  // onAnimePress/onBoundsChange/onUserPan props never change identity (no
  // remount) yet always call the claiming screen's current callbacks.
  const onAnimePress = useCallback(
    (id: number) => handlersRef.current.onAnimePress(id),
    []
  );
  const onBoundsChange = useCallback(
    (bounds: BoundingBox) => handlersRef.current.onBoundsChange(bounds),
    []
  );
  const onUserPan = useCallback(() => handlersRef.current.onUserPan(), []);

  const value = useMemo<MapHostContextValue>(
    () => ({ claim, update, release, recenter, setHeading }),
    [claim, update, release, recenter, setHeading]
  );

  const { config } = state;

  // MapLibre hub markers — 1:1 from the same HubMapMarker[] the leaflet path uses.
  const maplibreMarkers = useMemo(
    () => config.markers.map(hubMarkerToMapMarker),
    [config.markers]
  );

  // Focus the camera on the selected anime; fly to a chosen region.
  useEffect(() => {
    if (config.focusBangumiId == null) return;
    const m = config.markers.find((mk) => mk.bangumiId === config.focusBangumiId);
    if (m) hostRef.current?.focus?.({ lat: m.lat, lng: m.lng, zoom: 11 });
  }, [config.focusBangumiId, config.markers]);

  useEffect(() => {
    if (!config.flyBoundsRequest) return;
    hostRef.current?.fitBounds?.(config.flyBoundsRequest.bounds);
  }, [config.flyBoundsRequest]);

  return (
    <PortalProvider>
      <MapHostContext.Provider value={value}>
        {/* BOTTOM layer = the navigator. Non-map pilgrimage screens (index,
            detail, album) paint here and stay fully interactive because the top
            layer below is pointerEvents:none while unclaimed. */}
        {children}
        {/* TOP layer, ABOVE the navigator — the only place the kept-alive
            WebView both shows AND receives gestures (see the layering note at
            the top of this file). Gated by `active`: while unclaimed it is
            invisible + non-interactive so the navigator shows through, but the
            WebView stays MOUNTED so Leaflet is parsed once per session. */}
        <View
          style={[StyleSheet.absoluteFill, { opacity: state.active ? 1 : 0 }]}
          pointerEvents={state.active ? 'box-none' : 'none'}>
          {/* WebView at the bottom of the top layer (auto = the hit target for
              empty-map taps). The parent View gates visibility/interactivity;
              this stays a plain always-auto holder. */}
          <View style={StyleSheet.absoluteFill} pointerEvents="auto">
            <MapSurface
              ref={hostRef}
              markers={maplibreMarkers}
              styleUrl={styleUrl}
              user={
                config.userLocation
                  ? { lat: config.userLocation.latitude, lng: config.userLocation.longitude }
                  : null
              }
              clusterDisableAtZoom={CLUSTER_DISABLE_AT.hub}
              onMarkerPress={(m) => {
                if (m.bangumiId != null) onAnimePress(m.bangumiId);
              }}
              onBoundsChange={onBoundsChange}
              onPanned={onUserPan}
            />
          </View>
          {/* Claiming screen's overlays teleport here — rendered AFTER the
              WebView so they sit on top of it, in the SAME box-none layer, so
              empty-map taps fall through the overlays to the map beneath. */}
          <PortalHost name={MAP_PORTAL_HOST} />
        </View>
      </MapHostContext.Provider>
    </PortalProvider>
  );
}
