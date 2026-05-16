// Pilgrimage detail screen.
// Path: /pilgrimage/{bangumiId}
//
// Spec: spec/pilgrimage_spec.md §8 (Routes).
//
// Visual language follows japanwalker.pen: a parallax hero, then a glassy
// floating header (back / camera / share) whose backdrop and sticky title
// fade in once the hero scrolls past. All surfaces flow from useTheme() so a
// theme/accent switch repaints the whole screen.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { ON_DARK, Skeleton, ThemedText, readableTextOn } from '../../../components/themed';
import { pilgrimageRepository } from '../../../libs/services/pilgrimage/pilgrimage-repository';
import { anitabiService } from '../../../libs/services/pilgrimage/anitabi-service';
import { listCaptures, type PilgrimageCapture } from '../../../libs/services/pilgrimage/captures';
import { locationService, type LatLng } from '../../../libs/services/pilgrimage/location-service';
import {
  LEAFLET_CSS,
  LEAFLET_JS,
  LEAFLET_MARKERCLUSTER_CSS,
  LEAFLET_MARKERCLUSTER_JS,
} from '../../../libs/services/pilgrimage/leaflet-assets';
import {
  MAP_BASE_BODY,
  MAP_BASE_CSS,
  MAP_BASE_JS,
  MAP_BASE_URL,
  TILE_STYLES,
  TOKYO_STATION,
  buildMapThemeVars,
  resolveTileStyle,
  type MapThemeVars,
  type TileStyleId,
} from '../../../libs/services/pilgrimage/leaflet-map';
import { resolveMapMode } from '../../../libs/services/pilgrimage/map-theme-prefs';
import { useMapThemePref } from '../../../hooks/useMapThemePref';
import {
  loadVisitedSpots,
  saveVisitedSpots,
  type VisitedMap,
} from '../../../libs/services/pilgrimage/visited-prefs';
import {
  dataSourceConfig,
  isSupportedBrowseSource,
} from '../../../libs/services/data-source-config';
import { PLATFORM_CONFIGS, type PlatformType } from '../../../libs/services/auth/types';
import { getNumberParam, getStringParam } from '../../../libs/utils/route-params';
import {
  formatPilgrimageSubtitle,
  getPilgrimageAnimeTitles,
  getPilgrimageSpotTitles,
} from '../../../libs/services/pilgrimage/pilgrimage-localization';
import { getPilgrimageDetailBackRoute } from '../../../libs/services/pilgrimage/pilgrimage-navigation';
import { groupPointsIntoSpots } from '../../../libs/services/pilgrimage/anitabi-points';
import {
  getNearestSceneForSpot,
  getSpotDistanceKm,
  sortSpotsByDistance,
} from '../../../libs/services/pilgrimage/spot-distance-sort';
import type {
  AnitabiBangumi,
  AnitabiPoint,
  AnitabiSpot,
} from '../../../libs/services/pilgrimage/types';

type ViewMode = 'list' | 'map';
type SpotFilter = 'all' | 'visited' | 'unvisited' | 'photos';

const HERO_HEIGHT = 320;
const HEADER_HEIGHT = 56;
const ANITABI_BASE_PAGE = 'https://anitabi.cn/bangumi/';

function buildMapsURL(lat: number, lng: number, name?: string): string {
  const encoded = name ? encodeURIComponent(name) : '';
  if (Platform.OS === 'ios') {
    const q = encoded ? `&q=${encoded}` : '';
    return `https://maps.apple.com/?ll=${lat},${lng}${q}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function hasValidGeo(geo: readonly [number, number] | null | undefined): boolean {
  if (!geo || geo.length < 2) return false;
  const [lat, lng] = geo;
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

function formatDistanceKm(km: number): string {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function chunkPairs<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}

function buildBrowseUrl(platform: PlatformType, bangumiId: number): string | null {
  if (platform === 'bangumi') return `https://bgm.tv/subject/${bangumiId}`;
  return `${ANITABI_BASE_PAGE}${bangumiId}`;
}

interface MapMarkerPayload {
  id: string;
  lat: number;
  lng: number;
  title: string;
  image: string;
  ep: number;
  ringColor: string;
  visited: boolean;
}

function buildSpotMapHtml(initial: {
  center: { lat: number; lng: number; zoom: number };
  user: { lat: number; lng: number } | null;
  ringColor: string;
  /** True when `center` is the anime's real geo, false when it's a Tokyo
   * Station fallback. Drives whether we snap to the first marker if the
   * initial framing turns out to be in the wrong place. */
  hasCenter: boolean;
  tileStyle: TileStyleId;
  themeVars: MapThemeVars;
}): string {
  const initialJson = JSON.stringify(initial).replace(/</g, '\\u003c');
  const tile = TILE_STYLES[initial.tileStyle];
  const themeVarsCss = Object.entries(initial.themeVars)
    .map(([k, v]) => `${k}: ${v};`)
    .join(' ');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>${LEAFLET_CSS}</style>
<style>${LEAFLET_MARKERCLUSTER_CSS}</style>
<style>${MAP_BASE_CSS}</style>
<style>
  :root { ${themeVarsCss} }
  /* +/- zoom buttons reuse the shared .map-btn FAB; .disabled dims one
     once the map hits a zoom limit, like Leaflet's native control. */
  .map-btn.disabled { opacity: 0.4; pointer-events: none; }
  /* Same balloon language as the other two maps. The EP chip is a small
     white pill in the top-left so the photo dominates. Visited state is
     a green ring (Google Maps "saved" green #34A853), not a thicker border. */
  .spot-marker {
    position: relative;
    width: 48px; height: 48px; border-radius: 50%;
    border: 3px solid #ffffff;
    background: var(--map-chrome);
    overflow: visible;
    box-shadow: 0 1px 3px 0 rgba(0,0,0,0.30),
                0 4px 8px 3px rgba(0,0,0,0.15);
  }
  .spot-marker .photo {
    width: 100%; height: 100%; border-radius: 50%; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
  }
  .spot-marker .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .spot-marker::after {
    content: ''; position: absolute;
    bottom: -8px; left: 50%; transform: translateX(-50%);
    width: 0; height: 0;
    border-left: 7px solid transparent;
    border-right: 7px solid transparent;
    border-top: 9px solid #ffffff;
    filter: drop-shadow(0 2px 1px rgba(0,0,0,0.18));
  }
  .spot-marker .region-dot {
    position: absolute; right: -2px; bottom: 2px;
    width: 14px; height: 14px; border-radius: 50%;
    background: var(--ring, #4285F4);
    border: 2px solid #ffffff;
    box-shadow: 0 1px 2px rgba(0,0,0,0.25);
  }
  .spot-marker.visited { border-color: #34A853; }
  .spot-marker.visited::after { border-top-color: #34A853; }
  .spot-marker .ep {
    position: absolute; left: -4px; top: -4px;
    min-width: 18px; height: 18px; padding: 0 5px;
    background: #ffffff; color: #1F1F1F;
    border-radius: 9px;
    font: 700 9px 'Google Sans Text', Roboto, system-ui, sans-serif;
    line-height: 18px; text-align: center;
    box-shadow: 0 1px 2px rgba(0,0,0,0.25);
  }
  .spot-marker.visited .ep { background: #34A853; color: #ffffff; }
</style>
</head>
<body>
${MAP_BASE_BODY}
<script>${LEAFLET_JS}</script>
<script>${LEAFLET_MARKERCLUSTER_JS}</script>
<script>${MAP_BASE_JS}</script>
<script>
(function() {
  var initial = ${initialJson};
  var map = L.map('map', { zoomControl: false, attributionControl: true, fadeAnimation: true })
    .setView([initial.center.lat, initial.center.lng], initial.center.zoom);
  new window.CachedTileLayer(${JSON.stringify(tile.url)}, {
    maxZoom: ${tile.maxZoom},
    minZoom: 3,
    subdomains: ${JSON.stringify(tile.subdomains)},
    attribution: ${JSON.stringify(tile.attribution)},
    keepBuffer: 4,
    updateWhenIdle: false
  }).addTo(map);

  if (initial.user) {
    var userIcon = L.divIcon({ className: '', html: '<div class="user-pulse"></div>', iconSize: [16,16], iconAnchor: [8,8] });
    L.marker([initial.user.lat, initial.user.lng], { icon: userIcon, interactive: false, keyboard: false }).addTo(map);
  }

  var initialCenter = L.latLng(initial.center.lat, initial.center.lng);
  var initialZoom = initial.center.zoom;
  var lastBounds = null;

  window.__bindMap(map, function recenter() {
    // Spot-detail screen: zoom tight to user (~1.5 km diagonal at zoom 15)
    // so the next walkable spot is reachable from the framing instead of
    // burying the user pin inside a wide overview.
    if (initial.user) {
      var did = window.__fitNearby(map, initial.user, null, {
        zoom: 15,
        home: { lat: initial.center.lat, lng: initial.center.lng, zoom: initial.center.zoom },
      });
      if (did) return;
    }
    if (lastBounds) {
      try { map.flyToBounds(lastBounds, { padding: [40, 40], maxZoom: 15, duration: 0.4 }); return; } catch (e) {}
    }
    map.flyTo(initialCenter, initialZoom, { duration: 0.4 });
  });

  // This map is embedded in a vertical ScrollView, so pinch-zoom competes
  // with page scroll — explicit +/- buttons are the reliable way to zoom
  // here (the fullscreen pilgrimage maps stay pinch-only by design). They
  // stack above the shared recenter FAB inside #map-controls.
  (function() {
    var controls = document.getElementById('map-controls');
    if (!controls) return;
    var recenter = controls.querySelector('[data-act="re"]');
    function makeZoomBtn(act, label, iconPath) {
      var btn = document.createElement('div');
      btn.className = 'map-btn';
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', label);
      btn.setAttribute('data-act', act);
      btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + iconPath + '"/></svg>';
      btn.addEventListener('click', function() {
        if (act === 'zoom-in') map.zoomIn();
        else map.zoomOut();
      });
      return btn;
    }
    var zoomIn = makeZoomBtn('zoom-in', 'Zoom in', 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z');
    var zoomOut = makeZoomBtn('zoom-out', 'Zoom out', 'M19 13H5v-2h14v2z');
    if (recenter) {
      controls.insertBefore(zoomIn, recenter);
      controls.insertBefore(zoomOut, recenter);
    } else {
      controls.appendChild(zoomIn);
      controls.appendChild(zoomOut);
    }
    function syncZoomLimits() {
      zoomIn.classList.toggle('disabled', map.getZoom() >= map.getMaxZoom());
      zoomOut.classList.toggle('disabled', map.getZoom() <= map.getMinZoom());
    }
    map.on('zoomend', syncZoomLimits);
    syncZoomLimits();
  })();

  var markerLayer = window.__makeClusterGroup({ ringColor: initial.ringColor, disableAt: 16 });
  markerLayer.addTo(map);
  var didFit = false;

  window.__updateMarkers = function(markers) {
    markerLayer.clearLayers();
    var batch = [];
    var bounds = [];
    for (var i = 0; i < markers.length; i++) {
      (function(m){
        var cls = 'spot-marker' + (m.visited ? ' visited' : '');
        var photoInner = m.image ? '<img src="' + m.image + '" loading="lazy" />' : '';
        var html = '<div class="' + cls + '">' +
          '<div class="photo">' + photoInner + '</div>' +
          '<span class="region-dot" style="background:' + m.ringColor + '"></span>' +
          '<span class="ep">EP ' + m.ep + '</span>' +
        '</div>';
        // Same balloon dimensions as the other maps: 48 wide × 57 tall
        // (48 + 9 tail). Anchor at the tail tip (24, 57).
        var icon = L.divIcon({ className: '', html: html, iconSize: [48, 57], iconAnchor: [24, 57] });
        var marker = L.marker([m.lat, m.lng], { icon: icon });
        marker.__appId = m.id;
        marker.on('click', function() { window.__post({ type: 'spotPress', id: m.id }); });
        batch.push(marker);
        bounds.push([m.lat, m.lng]);
      })(markers[i]);
    }
    if (typeof markerLayer.addLayers === 'function') markerLayer.addLayers(batch);
    else for (var k = 0; k < batch.length; k++) markerLayer.addLayer(batch[k]);

    if (bounds.length > 0) {
      try { lastBounds = L.latLngBounds(bounds); } catch (e) { lastBounds = null; }
    }
    // Intentionally NO map.fitBounds(bounds) here. Anime spots routinely
    // span an entire city (or several prefectures for road-trip anime), and
    // fit-to-all would zoom out so far the user just sees a country map.
    // We keep the initial setView (anime.geo + walking-scale zoom from the
    // builder) so the user lands on a focused "around-the-spot" framing.
    // The recenter button (window.__bindMap above) still uses lastBounds
    // for users who deliberately want the wider view.
    //
    // For the edge case where we had no anime center at all (initial view
    // was Tokyo Station) AND the actual spots are elsewhere, jump to the
    // first spot so the screen isn't pointed at the wrong city.
    if (!didFit && bounds.length > 0 && !initial.hasCenter) {
      try { map.setView(bounds[0], 13, { animate: false }); didFit = true; } catch (e) {}
    }
  };

  // Native pushes a target lat/lng when the user picks a spot from the
  // chip strip above the map. We pan tight (~3-block walking framing) so
  // the user immediately sees what's around the chosen scene instead of
  // a wide overview.
  window.__focusSpot = function(target) {
    if (!target || typeof target.lat !== 'number' || typeof target.lng !== 'number') return;
    try { map.flyTo([target.lat, target.lng], 16, { duration: 0.45 }); } catch (e) {}
  };

  window.__post({ type: 'ready' });
})();
</script>
</body>
</html>`;
}

interface SpotMapViewProps {
  spots: readonly AnitabiPoint[];
  visited: VisitedMap;
  ringColor: string;
  userLocation: LatLng | null;
  centerGeo: readonly [number, number] | null;
  centerZoom: number;
  /**
   * Id of the spot currently selected in the chip strip above the map. When
   * this changes, the WebView pans/zooms to that spot so the chip strip
   * doubles as a quick spot picker without forcing the modal sheet open.
   */
  focusSpotId?: string | null;
  onSpotPress: (spot: AnitabiPoint) => void;
  onClusterPick: (spots: readonly AnitabiPoint[]) => void;
  theme: ThemePalette;
  style?: StyleProp<ViewStyle>;
}

function SpotMapView({
  spots,
  visited,
  ringColor,
  userLocation,
  centerGeo,
  centerZoom,
  focusSpotId,
  onSpotPress,
  onClusterPick,
  theme,
  style,
}: SpotMapViewProps) {
  const { effectiveMode } = useTheme();
  const { pref: mapThemePref } = useMapThemePref();
  const mapMode = resolveMapMode(mapThemePref, effectiveMode);
  const webviewRef = useRef<WebView>(null);
  const spotsById = useRef(new Map<string, AnitabiPoint>());
  const [ready, setReady] = useState(false);
  const styles = useMemo(() => makeMapStyles(theme), [theme]);

  const html = useMemo(() => {
    // Prefer the anime's own center when known; otherwise fall back to Tokyo
    // Station rather than the dead-middle-of-Honshu/zoom-5 view, so the spot
    // map never opens on an empty patch of ocean while data loads.
    //
    // Cap zoom to [12, 15] so we always land at a walking-scale framing
    // (~3–10 km wide) instead of zoom-5 country views. Pilgrimage is a
    // location-specific activity — the user wants to see "what's around this
    // spot", never "all of Japan".
    const desiredZoom = Math.max(12, Math.min(15, centerZoom || 13));
    const hasCenter = !!(centerGeo && hasValidGeo(centerGeo));
    const fallback = hasCenter
      ? { lat: centerGeo![0], lng: centerGeo![1], zoom: desiredZoom }
      : { lat: TOKYO_STATION.lat, lng: TOKYO_STATION.lng, zoom: 13 };
    const user = userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : null;
    const tileStyle: TileStyleId = resolveTileStyle(mapMode);
    const themeVars: MapThemeVars = buildMapThemeVars({
      effectiveMode: mapMode,
      accent: theme.accent,
      tileStyle,
    });
    return buildSpotMapHtml({ center: fallback, user, ringColor, hasCenter, tileStyle, themeVars });
    // First-paint values captured once. Live theme updates pushed via the
    // bridge effect below — re-rendering would wipe tile cache + camera state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live tile + chrome theme push.
  useEffect(() => {
    if (!ready || !webviewRef.current) return;
    const tileStyle: TileStyleId = resolveTileStyle(mapMode);
    const tile = TILE_STYLES[tileStyle];
    const themeVars = buildMapThemeVars({
      effectiveMode: mapMode,
      accent: theme.accent,
      tileStyle,
    });
    webviewRef.current.injectJavaScript(`
      try { window.__setMapTheme && window.__setMapTheme(${JSON.stringify(themeVars)}); } catch(e) {}
      try { window.__setTileStyle && window.__setTileStyle(${JSON.stringify({
        url: tile.url,
        subdomains: tile.subdomains,
        attribution: tile.attribution,
        maxZoom: tile.maxZoom,
      })}); } catch(e) {}
      true;
    `);
  }, [mapMode, theme.accent, ready]);

  const markers = useMemo(() => {
    const out: MapMarkerPayload[] = [];
    spotsById.current.clear();
    for (const spot of spots) {
      if (!hasValidGeo(spot.geo)) continue;
      const titles = getPilgrimageSpotTitles(spot);
      spotsById.current.set(spot.id, spot);
      out.push({
        id: spot.id,
        lat: spot.geo[0],
        lng: spot.geo[1],
        title: titles.primary,
        image: spot.image ?? '',
        ep: spot.ep,
        ringColor,
        visited: visited[spot.id] === true,
      });
    }
    return out;
  }, [spots, visited, ringColor]);

  useEffect(() => {
    if (!ready || !webviewRef.current) return;
    const json = JSON.stringify(markers).replace(/</g, '\\u003c');
    webviewRef.current.injectJavaScript(`
      try { window.__updateMarkers && window.__updateMarkers(${json}); } catch(e) {}
      true;
    `);
  }, [markers, ready]);

  useEffect(() => {
    if (!ready || !webviewRef.current || !focusSpotId) return;
    const spot = spotsById.current.get(focusSpotId);
    if (!spot || !hasValidGeo(spot.geo)) return;
    const payload = JSON.stringify({ lat: spot.geo[0], lng: spot.geo[1] });
    webviewRef.current.injectJavaScript(`
      try { window.__focusSpot && window.__focusSpot(${payload}); } catch(e) {}
      true;
    `);
  }, [focusSpotId, ready, markers]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        type: string;
        id?: string;
        ids?: unknown[];
      };
      if (data.type === 'ready') {
        setReady(true);
        return;
      }
      if (data.type === 'spotPress' && data.id) {
        const spot = spotsById.current.get(data.id);
        if (spot) onSpotPress(spot);
        return;
      }
      if (data.type === 'clusterPress' && Array.isArray(data.ids)) {
        const picked: AnitabiPoint[] = [];
        for (const raw of data.ids) {
          const s = spotsById.current.get(String(raw));
          if (s) picked.push(s);
        }
        if (picked.length > 0) onClusterPick(picked);
      }
    } catch {
      // ignore
    }
  };

  return (
    <View style={[styles.container, style]} testID="pilgrimage-spot-map">
      <WebView
        ref={webviewRef}
        originWhitelist={['*']}
        source={{ html, baseUrl: MAP_BASE_URL }}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        cacheMode={Platform.OS === 'android' ? 'LOAD_DEFAULT' : undefined}
        allowsInlineMediaPlayback
        androidLayerType="hardware"
        onMessage={handleMessage}
        style={styles.webview}
        renderError={() => (
          <View style={styles.fallback}>
            <Ionicons name="map-outline" size={32} color={theme.text.secondary} />
            <ThemedText variant="titleMedium" weight="600" style={styles.fallbackTitle}>
              Map unavailable
            </ThemedText>
            <ThemedText variant="bodySmall" tone="secondary" align="center">
              Couldn&apos;t load the map. Check your connection and try again.
            </ThemedText>
          </View>
        )}
        startInLoadingState
      />
    </View>
  );
}

interface LayoutModeButtonProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  active: boolean;
  themeColor: string;
  themeColorFg: string;
  theme: ThemePalette;
  accessibilityLabel: string;
  onPress: () => void;
}

function LayoutModeButton({
  icon,
  active,
  themeColor,
  themeColorFg,
  theme,
  accessibilityLabel,
  onPress,
}: LayoutModeButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: 34,
          height: 30,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          backgroundColor: active ? themeColor : theme.background.secondary,
          borderColor: active ? themeColor : theme.glassBorder,
        },
        pressed && { opacity: 0.8 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel}>
      <Ionicons name={icon} size={16} color={active ? themeColorFg : theme.text.secondary} />
    </Pressable>
  );
}

interface SpotRowProps {
  /** Representative scene of the location (its first cut). */
  spot: AnitabiPoint;
  /** Number of scene-cuts filmed at this location (>= 1). */
  sceneCount: number;
  themeColor: string;
  themeColorFg: string;
  distanceKm: number | null;
  visited: boolean;
  hasCapture: boolean;
  theme: ThemePalette;
  onPress: (spot: AnitabiPoint) => void;
  onToggleVisited: (spot: AnitabiPoint) => void;
  onOpenMaps: (spot: AnitabiPoint) => void;
}

function SpotRow({
  spot,
  sceneCount,
  themeColor,
  themeColorFg,
  distanceKm,
  visited,
  hasCapture,
  theme,
  onPress,
  onToggleVisited,
  onOpenMaps,
}: SpotRowProps) {
  const styles = useMemo(() => makeRowStyles(theme), [theme]);
  const hasGeo = hasValidGeo(spot.geo);
  const titles = getPilgrimageSpotTitles(spot);
  return (
    <Pressable
      onPress={() => onPress(spot)}
      style={({ pressed }) => [
        styles.card,
        visited && {
          borderColor: `${theme.status.success}66`,
          backgroundColor: `${theme.status.success}0D`,
        },
        pressed && { opacity: 0.94 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${titles.primary}`}>
      <View style={styles.imageRow}>
        <View style={styles.imageHalf}>
          <Image
            source={{ uri: spot.image }}
            style={styles.imgFull}
            contentFit="cover"
            transition={150}
          />
          <View style={styles.labelChip}>
            <ThemedText variant="captionSmall" weight="800" style={styles.labelText}>
              REAL
            </ThemedText>
          </View>
        </View>
        <View style={styles.imageHalf}>
          <Image
            source={{ uri: spot.image }}
            style={[styles.imgFull, { opacity: 0.92 }]}
            contentFit="cover"
            transition={150}
          />
          <View style={[styles.labelChip, { backgroundColor: `${themeColor}E6` }]}>
            <ThemedText
              variant="captionSmall"
              weight="800"
              style={[styles.labelText, { color: themeColorFg }]}>
              ANIME
            </ThemedText>
          </View>
          {hasCapture ? (
            <View style={[styles.captureDot, { borderColor: theme.background.primary }]}>
              <Ionicons name="camera" size={9} color="#000" />
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.infoRow}>
        <View style={styles.infoCol}>
          <ThemedText variant="bodyMedium" weight="700" numberOfLines={1}>
            {titles.primary}
          </ThemedText>
          <View style={styles.epRow}>
            <Ionicons
              name={sceneCount > 1 ? 'images-outline' : 'film-outline'}
              size={11}
              color={theme.text.tertiary}
            />
            <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
              {sceneCount > 1
                ? `${sceneCount} scenes`
                : spot.ep > 0
                  ? `EP ${spot.ep}`
                  : 'Scene'}
              {titles.secondary ? ` · ${titles.secondary}` : ''}
            </ThemedText>
            {distanceKm != null ? (
              <>
                <View style={[styles.dot, { backgroundColor: theme.text.tertiary }]} />
                <ThemedText variant="captionSmall" weight="600" style={{ color: themeColor }}>
                  {formatDistanceKm(distanceKm)}
                </ThemedText>
              </>
            ) : null}
          </View>
        </View>
        <View style={styles.actionsCol}>
          <Pressable
            onPress={() => onToggleVisited(spot)}
            style={({ pressed }) => [
              styles.visitPill,
              {
                backgroundColor: visited ? theme.background.tertiary : theme.background.secondary,
                borderColor: visited ? `${theme.status.success}66` : theme.glassBorder,
              },
              pressed && { opacity: 0.75 },
            ]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: visited }}
            accessibilityLabel={visited ? 'Mark as not visited' : 'Mark as visited'}
            hitSlop={4}>
            <Ionicons
              name={visited ? 'checkmark' : 'ellipse-outline'}
              size={12}
              color={visited ? theme.status.success : theme.text.secondary}
            />
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{
                color: visited ? theme.status.success : theme.text.secondary,
              }}>
              {visited ? 'Visited' : 'Visit'}
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => onOpenMaps(spot)}
            disabled={!hasGeo}
            style={({ pressed }) => [
              styles.iconPill,
              { backgroundColor: theme.background.tertiary },
              !hasGeo && { opacity: 0.4 },
              pressed && hasGeo && { opacity: 0.75 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Directions to ${titles.primary}`}
            hitSlop={4}>
            <MaterialIcons
              name="directions"
              size={16}
              color={hasGeo ? theme.status.info : theme.text.tertiary}
            />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

interface SceneTileProps {
  /** Representative scene of the location (its first cut). */
  spot: AnitabiPoint;
  /** Number of scene-cuts filmed at this location (>= 1). */
  sceneCount: number;
  themeColor: string;
  themeColorFg: string;
  distanceKm: number | null;
  visited: boolean;
  hasCapture: boolean;
  captureUri: string | null;
  theme: ThemePalette;
  onPress: (spot: AnitabiPoint) => void;
  onToggleVisited: (spot: AnitabiPoint) => void;
  onTakeComparison: (spot: AnitabiPoint) => void;
}

function SceneTile({
  spot,
  sceneCount,
  themeColor,
  themeColorFg,
  distanceKm,
  visited,
  hasCapture,
  captureUri,
  theme,
  onPress,
  onToggleVisited,
  onTakeComparison,
}: SceneTileProps) {
  const styles = useMemo(() => makeTileStyles(theme), [theme]);
  const titles = getPilgrimageSpotTitles(spot);
  const primaryMeta =
    sceneCount > 1 ? `${sceneCount} scenes` : spot.ep > 0 ? `EP ${spot.ep}` : 'Scene';
  const metaLine =
    distanceKm != null ? `${primaryMeta} · ${formatDistanceKm(distanceKm)}` : primaryMeta;
  const [showCapture, setShowCapture] = useState(false);
  const flipped = showCapture && !!captureUri;
  const displayedUri = flipped ? captureUri! : spot.image;
  const handleFlip = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    if (captureUri) {
      setShowCapture((s) => !s);
    } else {
      onTakeComparison(spot);
    }
  }, [captureUri, onTakeComparison, spot]);
  return (
    <Pressable
      onPress={() => onPress(spot)}
      onLongPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        onToggleVisited(spot);
      }}
      delayLongPress={280}
      style={({ pressed }) => [
        styles.tile,
        visited && { borderColor: `${theme.status.success}80` },
        pressed && { opacity: 0.92 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${titles.primary}`}
      accessibilityHint="Long press to toggle visited">
      <Image
        source={{ uri: displayedUri }}
        style={styles.image}
        contentFit="cover"
        transition={160}
      />
      <View style={styles.baseMask} pointerEvents="none" />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.62)']}
        locations={[0, 1]}
        style={styles.captionGradient}
        pointerEvents="none"
      />
      {hasCapture ? (
        <View
          style={[
            styles.cornerBadge,
            styles.cornerLeft,
            { backgroundColor: `${themeColor}E6` },
          ]}>
          <Ionicons name="camera" size={10} color={themeColorFg} />
        </View>
      ) : null}
      {visited ? (
        <View
          style={[
            styles.cornerBadge,
            styles.cornerRight,
            { backgroundColor: theme.status.success },
          ]}>
          <Ionicons name="checkmark" size={11} color={readableTextOn(theme.status.success)} />
        </View>
      ) : null}
      <View style={styles.captionWrap} pointerEvents="none">
        <ThemedText
          variant="bodySmall"
          weight="700"
          numberOfLines={1}
          style={styles.captionTitle}>
          {titles.primary}
        </ThemedText>
        <ThemedText
          variant="captionSmall"
          weight="600"
          numberOfLines={1}
          style={styles.captionMeta}>
          {metaLine}
        </ThemedText>
      </View>
      <Pressable
        onPress={handleFlip}
        hitSlop={6}
        style={({ pressed }) => [
          styles.flipBtn,
          flipped && { backgroundColor: `${themeColor}E6` },
          pressed && { opacity: 0.75 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={
          captureUri
            ? flipped
              ? 'Show scene image'
              : 'Show your photo'
            : 'Take comparison photo'
        }>
        <Ionicons
          name={captureUri ? 'swap-horizontal' : 'camera-outline'}
          size={14}
          color={flipped ? themeColorFg : ON_DARK}
        />
      </Pressable>
    </Pressable>
  );
}

interface SpotSheetProps {
  spot: AnitabiPoint | null;
  animeId: string;
  themeColor: string;
  themeColorFg: string;
  distanceKm: number | null;
  visited: boolean;
  hasCapture: boolean;
  theme: ThemePalette;
  onClose: () => void;
  onToggleVisited: (spot: AnitabiPoint) => void;
  onOpenMaps: (spot: AnitabiPoint) => void;
  onFrameShot: (spot: AnitabiPoint) => void;
}

function SpotSheet({
  spot,
  animeId: _animeId,
  themeColor,
  themeColorFg,
  distanceKm,
  visited,
  hasCapture,
  theme,
  onClose,
  onToggleVisited,
  onOpenMaps,
  onFrameShot,
}: SpotSheetProps) {
  const styles = useMemo(() => makeSheetStyles(theme), [theme]);
  if (!spot) return null;
  const hasGeo = hasValidGeo(spot.geo);
  const titles = getPilgrimageSpotTitles(spot);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <SafeAreaView edges={['bottom']}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <Image
                source={{ uri: spot.image }}
                style={styles.cover}
                contentFit="cover"
                transition={150}
              />
              <View style={styles.headerText}>
                <View style={[styles.epPill, { backgroundColor: `${themeColor}E6` }]}>
                  <ThemedText variant="captionSmall" weight="700" style={{ color: themeColorFg }}>
                    EP {spot.ep}
                  </ThemedText>
                </View>
                <ThemedText
                  variant="titleLarge"
                  weight="700"
                  numberOfLines={2}
                  style={{ marginBottom: 2 }}>
                  {titles.primary}
                </ThemedText>
                {titles.secondary ? (
                  <ThemedText
                    variant="bodySmall"
                    tone="secondary"
                    numberOfLines={1}
                    style={{ marginBottom: 4 }}>
                    {titles.secondary}
                  </ThemedText>
                ) : null}
                {distanceKm != null ? (
                  <ThemedText variant="captionSmall" tone="tertiary" weight="500">
                    {formatDistanceKm(distanceKm)} away
                  </ThemedText>
                ) : null}
              </View>
              <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={theme.text.secondary} />
              </Pressable>
            </View>

            <View style={styles.actions}>
              <Pressable
                onPress={() => onToggleVisited(spot)}
                style={({ pressed }) => [
                  styles.actionBtn,
                  visited
                    ? { backgroundColor: theme.status.success }
                    : {
                        backgroundColor: theme.background.tertiary,
                        borderColor: theme.glassBorder,
                        borderWidth: 1,
                      },
                  pressed && { opacity: 0.85 },
                ]}>
                <Ionicons
                  name={visited ? 'checkmark-circle' : 'checkmark-circle-outline'}
                  size={18}
                  color={visited ? readableTextOn(theme.status.success) : theme.text.primary}
                />
                <ThemedText
                  variant="bodyMedium"
                  weight="700"
                  style={{
                    color: visited ? readableTextOn(theme.status.success) : theme.text.primary,
                  }}>
                  {visited ? 'Visited' : 'Mark visited'}
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => onOpenMaps(spot)}
                disabled={!hasGeo}
                style={({ pressed }) => [
                  styles.actionBtn,
                  hasGeo
                    ? { backgroundColor: themeColor }
                    : {
                        backgroundColor: theme.background.tertiary,
                        borderColor: theme.glassBorder,
                        borderWidth: 1,
                      },
                  pressed && hasGeo && { opacity: 0.85 },
                ]}>
                <MaterialIcons
                  name="directions"
                  size={18}
                  color={hasGeo ? themeColorFg : theme.text.tertiary}
                />
                <ThemedText
                  variant="bodyMedium"
                  weight="700"
                  style={{ color: hasGeo ? themeColorFg : theme.text.tertiary }}>
                  Directions
                </ThemedText>
              </Pressable>
            </View>

            <Pressable
              onPress={() => onFrameShot(spot)}
              style={({ pressed }) => [
                styles.frameShotBtn,
                {
                  backgroundColor: hasCapture ? `${themeColor}22` : theme.background.tertiary,
                  borderColor: hasCapture ? themeColor : theme.glassBorder,
                },
                pressed && { opacity: 0.82 },
              ]}>
              <Ionicons
                name={hasCapture ? 'camera' : 'camera-outline'}
                size={18}
                color={hasCapture ? themeColor : theme.text.primary}
              />
              <ThemedText
                variant="bodyMedium"
                weight="600"
                style={{ color: hasCapture ? themeColor : theme.text.primary }}>
                {hasCapture ? 'Reframe shot' : 'Frame shot'}
              </ThemedText>
              {hasCapture ? (
                <View style={[styles.frameShotDot, { backgroundColor: themeColor }]} />
              ) : null}
            </Pressable>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

interface RoundHeaderButtonProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  accessibilityLabel: string;
  tint: string;
  theme: ThemePalette;
}

function RoundHeaderButton({
  icon,
  onPress,
  accessibilityLabel,
  tint,
  theme,
}: RoundHeaderButtonProps) {
  const styles = useMemo(() => makeHeaderStyles(theme), [theme]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => [
        styles.roundBtn,
        { borderColor: `${tint}55` },
        pressed && { opacity: 0.78, transform: [{ scale: 0.94 }] },
      ]}>
      <Ionicons name={icon} size={18} color={tint} />
    </Pressable>
  );
}

export default function PilgrimageDetailScreen() {
  const params = useLocalSearchParams();
  const animeId = getStringParam(params, 'animeId');
  const bangumiId = getNumberParam(params, 'animeId');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const [anime, setAnime] = useState<AnitabiBangumi | null>(null);
  const [points, setPoints] = useState<readonly AnitabiPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [listLayout, setListLayout] = useState<'grid' | 'rows'>('grid');
  const [spotFilter, setSpotFilter] = useState<SpotFilter>('all');
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [visited, setVisited] = useState<VisitedMap>({});
  const [browseSource, setBrowseSource] = useState<PlatformType>(dataSourceConfig.browseSource);
  const [activeSpot, setActiveSpot] = useState<AnitabiPoint | null>(null);
  const [clusterSpots, setClusterSpots] = useState<readonly AnitabiPoint[] | null>(null);
  const [captures, setCaptures] = useState<Record<string, PilgrimageCapture>>({});
  // The currently-highlighted spot in the map's chip strip. We pre-pick the
  // first valid spot when the user first switches to map view so they always
  // land on a concrete pin instead of an unfocused overview.
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);

  const themeColor = anime?.color || theme.accent;
  const themeColorFg = readableTextOn(themeColor);
  const styles = useMemo(() => makeStyles(theme, insets.top), [theme, insets.top]);
  const animeTitles = useMemo(() => (anime ? getPilgrimageAnimeTitles(anime) : null), [anime]);
  const animeSubtitle = animeTitles ? formatPilgrimageSubtitle(animeTitles) : undefined;

  const refreshCaptures = useCallback(() => {
    listCaptures()
      .then((map) => setCaptures(map))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshCaptures();
  }, [refreshCaptures]);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  useEffect(() => {
    let cancelled = false;
    if (bangumiId === null || bangumiId <= 0) {
      setError('Invalid anime id');
      setLoading(false);
      return;
    }
    const validBangumiId = bangumiId;

    setLoading(true);
    setError(null);

    pilgrimageRepository
      .getSpotsByBangumiId(validBangumiId)
      .then(async (lite) => {
        if (cancelled) return;
        if (!lite) {
          setAnime(null);
          setPoints([]);
          setLoading(false);
          return;
        }
        setAnime(lite);
        setPoints(lite.litePoints ?? []);
        // Lite payload is enough to render the screen — let the user interact
        // immediately while the heavier full /points call runs in the
        // background and upgrades the points when it lands.
        setLoading(false);
        try {
          const detailed: AnitabiPoint[] =
            await anitabiService.getDetailedPoints(validBangumiId);
          if (!cancelled && detailed.length > 0) {
            setPoints(detailed);
          }
        } catch {
          // Lite data is enough; ignore.
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load pilgrimage';
        setError(message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bangumiId]);

  useEffect(() => {
    let cancelled = false;
    loadVisitedSpots().then((map) => {
      if (!cancelled) setVisited(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    locationService
      .getCurrentLocation()
      .then((loc) => {
        if (!cancelled && loc) setUserLocation(loc);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!dataSourceConfig.isInitialized) {
      dataSourceConfig
        .init()
        .then(() => {
          if (!cancelled) setBrowseSource(dataSourceConfig.browseSource);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // Prefer Bangumi's high-res poster (anime.bgm.tv) over Anitabi's tiny h160
  // thumbnail. Anitabi's CDN serves bangumi covers only at h160 — `?plan=h720`
  // 404s — so we previously rendered a black hero. Bangumi's /image redirect
  // returns the full-quality cover for any subject id we know.
  const posterUri = useMemo(() => {
    if (typeof bangumiId === 'number' && bangumiId > 0) {
      return `https://api.bgm.tv/v0/subjects/${bangumiId}/image?type=large`;
    }
    return anime?.cover ?? '';
  }, [bangumiId, anime?.cover]);

  const stats = useMemo(() => {
    const spotCount = anime?.pointsLength ?? points.length;
    const visitedCount = points.reduce((acc, p) => (visited[p.id] ? acc + 1 : acc), 0);
    const capturedCount = points.reduce((acc, p) => (captures[p.id] ? acc + 1 : acc), 0);
    let radiusKm = 0;
    if (anime && hasValidGeo(anime.geo)) {
      const [centerLat, centerLng] = anime.geo;
      let max = 0;
      for (const p of points) {
        if (!hasValidGeo(p.geo)) continue;
        const d = locationService.getDistanceKm(
          { latitude: centerLat, longitude: centerLng },
          { latitude: p.geo[0], longitude: p.geo[1] }
        );
        if (Number.isFinite(d) && d > max) max = d;
      }
      radiusKm = max;
    }
    return { spotCount, visitedCount, capturedCount, radiusKm };
  }, [anime, points, visited, captures]);

  const filteredPoints = useMemo(() => {
    switch (spotFilter) {
      case 'visited':
        return points.filter((p) => visited[p.id] === true);
      case 'unvisited':
        return points.filter((p) => visited[p.id] !== true);
      case 'photos':
        return points.filter((p) => !!captures[p.id]);
      default:
        return points;
    }
  }, [points, spotFilter, visited, captures]);

  // Anitabi returns one point per scene-cut, so a single shrine is often many
  // same-named points. Collapse cuts of the same real-world location into one
  // spot — the list then shows one row per place (with a scene count) instead
  // of N near-identical rows. The map stays per-cut: leaflet clustering already
  // handles overlapping markers.
  const groupedSpots = useMemo(() => groupPointsIntoSpots(points), [points]);

  const sortedGroupedSpots = useMemo(
    () => sortSpotsByDistance(groupedSpots, userLocation),
    [groupedSpots, userLocation]
  );

  const filteredGroupedSpots = useMemo(() => {
    switch (spotFilter) {
      case 'visited':
        return sortedGroupedSpots.filter((s) => s.scenes.some((p) => visited[p.id] === true));
      case 'unvisited':
        return sortedGroupedSpots.filter((s) => !s.scenes.some((p) => visited[p.id] === true));
      case 'photos':
        return sortedGroupedSpots.filter((s) => s.scenes.some((p) => !!captures[p.id]));
      default:
        return sortedGroupedSpots;
    }
  }, [sortedGroupedSpots, spotFilter, visited, captures]);

  // Filter-pill badges count locations (matching the list rows below them).
  const groupedCounts = useMemo(() => {
    let visitedSpots = 0;
    let photoSpots = 0;
    for (const s of groupedSpots) {
      if (s.scenes.some((p) => visited[p.id] === true)) visitedSpots += 1;
      if (s.scenes.some((p) => !!captures[p.id])) photoSpots += 1;
    }
    return {
      all: groupedSpots.length,
      visited: visitedSpots,
      unvisited: groupedSpots.length - visitedSpots,
      photos: photoSpots,
    };
  }, [groupedSpots, visited, captures]);

  // When the visible spot list changes (filter switch, data load) keep the
  // selection valid: if the current pick was filtered out, fall back to the
  // first spot that still has a real coordinate so the chip strip is never
  // empty while the map has markers.
  useEffect(() => {
    if (viewMode !== 'map' || filteredGroupedSpots.length === 0) {
      if (selectedSpotId !== null) setSelectedSpotId(null);
      return;
    }
    // A selection stays valid if it points at any on-map scene (a tapped
    // marker) or a chip's representative — only reset when it is neither.
    const stillVisible = selectedSpotId
      ? filteredPoints.some((p) => p.id === selectedSpotId)
      : false;
    if (stillVisible) return;
    const firstValid = filteredGroupedSpots
      .map((s) => getNearestSceneForSpot(s, userLocation))
      .find((p) => hasValidGeo(p.geo));
    setSelectedSpotId(firstValid ? firstValid.id : null);
  }, [viewMode, filteredPoints, filteredGroupedSpots, selectedSpotId, userLocation]);

  const handleSpotChipPress = useCallback((spot: AnitabiPoint) => {
    Haptics.selectionAsync().catch(() => undefined);
    setSelectedSpotId(spot.id);
  }, []);

  const distanceFor = useCallback(
    (spot: AnitabiPoint): number | null => {
      if (!userLocation || !hasValidGeo(spot.geo)) return null;
      const d = locationService.getDistanceKm(userLocation, {
        latitude: spot.geo[0],
        longitude: spot.geo[1],
      });
      return Number.isFinite(d) ? d : null;
    },
    [userLocation]
  );

  const distanceForGroup = useCallback(
    (spot: AnitabiSpot): number | null => getSpotDistanceKm(spot, userLocation),
    [userLocation]
  );

  const representativeForGroup = useCallback(
    (spot: AnitabiSpot): AnitabiPoint => getNearestSceneForSpot(spot, userLocation),
    [userLocation]
  );

  const handleToggleVisited = useCallback((spot: AnitabiPoint) => {
    Haptics.selectionAsync().catch(() => undefined);
    setVisited((prev) => {
      const next: VisitedMap = { ...prev };
      if (next[spot.id]) {
        delete next[spot.id];
      } else {
        next[spot.id] = true;
      }
      void saveVisitedSpots(next);
      return next;
    });
  }, []);

  // A grouped spot is one location; "visited" applies to every cut filmed
  // there, so the whole place flips with a single tap.
  const handleToggleGroupedVisited = useCallback((spot: AnitabiSpot) => {
    Haptics.selectionAsync().catch(() => undefined);
    setVisited((prev) => {
      const anyVisited = spot.scenes.some((p) => prev[p.id] === true);
      const next: VisitedMap = { ...prev };
      for (const p of spot.scenes) {
        if (anyVisited) delete next[p.id];
        else next[p.id] = true;
      }
      void saveVisitedSpots(next);
      return next;
    });
  }, []);

  // Single-cut location → open it directly. Multi-cut → let the user pick
  // which scene to frame (reuses the map's cluster picker sheet).
  const handleGroupedSpotPress = useCallback((spot: AnitabiSpot) => {
    Haptics.selectionAsync().catch(() => undefined);
    if (spot.scenes.length > 1) {
      setClusterSpots(spot.scenes);
    } else {
      setActiveSpot(spot.scenes[0]);
    }
  }, []);

  const handleOpenMaps = useCallback((spot: AnitabiPoint) => {
    if (!hasValidGeo(spot.geo)) return;
    Haptics.selectionAsync().catch(() => undefined);
    Linking.openURL(buildMapsURL(spot.geo[0], spot.geo[1], spot.name)).catch(() => undefined);
  }, []);

  const handleViewToggle = useCallback((mode: ViewMode) => {
    Haptics.selectionAsync().catch(() => undefined);
    setViewMode(mode);
  }, []);

  const handleOpenBrowse = useCallback(() => {
    if (!anime) return;
    const url = buildBrowseUrl(browseSource, anime.id);
    if (!url) return;
    Linking.openURL(url).catch(() => undefined);
  }, [anime, browseSource]);

  const handleBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    const explicitBackRoute = getPilgrimageDetailBackRoute(params);
    if (explicitBackRoute) {
      router.replace(explicitBackRoute);
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/pilgrimage');
    }
  }, [params, router]);

  const handleOpenAlbum = useCallback(() => {
    if (bangumiId === null) return;
    Haptics.selectionAsync().catch(() => undefined);
    router.push({ pathname: '/pilgrimage/album', params: { animeId: String(bangumiId) } });
  }, [router, bangumiId]);

  const handleShare = useCallback(() => {
    if (!anime) return;
    Haptics.selectionAsync().catch(() => undefined);
    const url = buildBrowseUrl(browseSource, anime.id) ?? '';
    Share.share({
      message: `${animeTitles?.primary ?? 'Pilgrimage'} · ${stats.spotCount} scenes${url ? `\n${url}` : ''}`,
    }).catch(() => undefined);
  }, [anime, animeTitles?.primary, browseSource, stats.spotCount]);

  const heroAnimatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      scrollY.value,
      [-HERO_HEIGHT, 0, HERO_HEIGHT],
      [-HERO_HEIGHT / 2, 0, HERO_HEIGHT * 0.45],
      Extrapolation.CLAMP
    );
    const scale = interpolate(scrollY.value, [-HERO_HEIGHT, 0], [1.6, 1], Extrapolation.CLAMP);
    return { transform: [{ translateY }, { scale }] };
  });

  // Hero content (title, badges) fades out as the user scrolls so the sticky
  // header can take over without the two titles overlapping.
  const heroContentStyle = useAnimatedStyle(() => {
    const op = interpolate(
      scrollY.value,
      [HERO_HEIGHT * 0.4, HERO_HEIGHT * 0.7],
      [1, 0],
      Extrapolation.CLAMP
    );
    return { opacity: op };
  });

  // Sticky bar backdrop ramps in once the hero clears the top.
  const stickyBackdropStyle = useAnimatedStyle(() => {
    const op = interpolate(
      scrollY.value,
      [HERO_HEIGHT - HEADER_HEIGHT - 100, HERO_HEIGHT - HEADER_HEIGHT],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity: op };
  });

  // Sticky title rises into place slightly behind the backdrop.
  const stickyTitleStyle = useAnimatedStyle(() => {
    const op = interpolate(
      scrollY.value,
      [HERO_HEIGHT - HEADER_HEIGHT - 60, HERO_HEIGHT - HEADER_HEIGHT],
      [0, 1],
      Extrapolation.CLAMP
    );
    const ty = interpolate(
      scrollY.value,
      [HERO_HEIGHT - HEADER_HEIGHT - 60, HERO_HEIGHT - HEADER_HEIGHT],
      [10, 0],
      Extrapolation.CLAMP
    );
    return { opacity: op, transform: [{ translateY: ty }] };
  });

  const browseLabel = useMemo(() => {
    const platform = isSupportedBrowseSource(browseSource) ? browseSource : 'bangumi';
    return PLATFORM_CONFIGS[platform]?.displayName ?? 'Browse';
  }, [browseSource]);

  const activeSpotVisited = activeSpot ? visited[activeSpot.id] === true : false;
  const activeSpotDistance = activeSpot ? distanceFor(activeSpot) : null;
  const activeSpotHasCapture = activeSpot ? !!captures[activeSpot.id] : false;

  const handleFrameShot = useCallback(
    (spot: AnitabiPoint) => {
      Haptics.selectionAsync().catch(() => undefined);
      setActiveSpot(null);
      const lat = hasValidGeo(spot.geo) ? String(spot.geo[0]) : undefined;
      const lng = hasValidGeo(spot.geo) ? String(spot.geo[1]) : undefined;
      const animeTitle = animeTitles?.primary ?? '';
      const spotTitles = getPilgrimageSpotTitles(spot);
      router.push({
        pathname: '/pilgrimage/compare/tips',
        params: {
          spotId: spot.id,
          imageUrl: spot.image,
          name: spotTitles.primary,
          ep: String(spot.ep),
          animeId: bangumiId !== null ? String(bangumiId) : '',
          animeTitle,
          themeColor,
          ...(lat ? { spotLat: lat } : {}),
          ...(lng ? { spotLng: lng } : {}),
        },
      });
    },
    [router, bangumiId, animeTitles?.primary, themeColor]
  );

  const isEmpty = !loading && !error && (!anime || points.length === 0);
  const heroAccentRgb = themeColor;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <LinearGradient colors={theme.gradient} style={StyleSheet.absoluteFill} />

        {/* Sticky animated header (always rendered, backdrop fades in). */}
        <View style={styles.headerWrap} pointerEvents="box-none">
          <Animated.View style={[styles.headerBackdrop, stickyBackdropStyle]} pointerEvents="none">
            <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: `${theme.background.primary}D9` },
              ]}
            />
            <View style={[styles.headerBackdropBorder, { backgroundColor: theme.glassBorder }]} />
          </Animated.View>

          <Animated.View style={[styles.headerStickyTitle, stickyTitleStyle]} pointerEvents="none">
            <ThemedText variant="titleMedium" weight="700" numberOfLines={1}>
              {animeTitles?.primary ?? 'Pilgrimage'}
            </ThemedText>
          </Animated.View>

          <View style={styles.headerActions}>
            <RoundHeaderButton
              icon="chevron-back"
              onPress={handleBack}
              accessibilityLabel="Back"
              tint={theme.text.primary}
              theme={theme}
            />
            <View style={styles.headerRightGroup}>
              <RoundHeaderButton
                icon="camera-outline"
                onPress={handleOpenAlbum}
                accessibilityLabel="Open pilgrimage album"
                tint={heroAccentRgb}
                theme={theme}
              />
              <RoundHeaderButton
                icon="share-outline"
                onPress={handleShare}
                accessibilityLabel="Share"
                tint={theme.text.primary}
                theme={theme}
              />
            </View>
          </View>
        </View>

        {loading ? (
          <View>
            <Skeleton.HeroDetail showEpisodes={false} />
            <View style={{ paddingHorizontal: 16 }}>
              <Skeleton.AnimeCardList count={5} />
            </View>
          </View>
        ) : error ? (
          <SafeAreaView style={styles.errorContainer}>
            <ThemedText variant="titleMedium" weight="700" align="center">
              Couldn&apos;t load pilgrimage
            </ThemedText>
            <ThemedText variant="bodyMedium" tone="secondary" align="center">
              {error}
            </ThemedText>
            <Pressable
              style={[styles.backBtn, { backgroundColor: theme.accent }]}
              onPress={handleBack}>
              <ThemedText
                variant="bodyMedium"
                weight="700"
                style={{ color: readableTextOn(theme.accent) }}>
                Go back
              </ThemedText>
            </Pressable>
          </SafeAreaView>
        ) : (
          <Animated.ScrollView
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}>
            <View style={styles.heroWrap}>
              <Animated.View style={[styles.heroImageWrap, heroAnimatedStyle]}>
                <Image
                  source={posterUri ? { uri: posterUri } : null}
                  style={styles.heroImage}
                  contentFit="cover"
                  transition={250}
                />
              </Animated.View>
              <LinearGradient
                colors={[
                  'rgba(0,0,0,0)',
                  `${theme.background.primary}66`,
                  `${theme.background.primary}E6`,
                  theme.background.primary,
                ]}
                locations={[0, 0.4, 0.78, 1]}
                style={styles.heroGradient}
              />
              <Animated.View style={[styles.heroOverlay, heroContentStyle]}>
                {anime ? (
                  <View
                    style={[
                      styles.heroSpotBadge,
                      { borderColor: `${themeColor}66`, backgroundColor: `${themeColor}1A` },
                    ]}>
                    <Ionicons name="location" size={11} color={themeColor} />
                    <ThemedText variant="captionSmall" weight="700" style={{ color: themeColor }}>
                      {stats.spotCount}{' '}
                      {stats.spotCount === 1 ? 'pilgrimage scene' : 'pilgrimage scenes'}
                    </ThemedText>
                  </View>
                ) : null}
                <ThemedText variant="headlineLarge" weight="800" numberOfLines={2}>
                  {animeTitles?.primary ?? ''}
                </ThemedText>
                {animeSubtitle ? (
                  <ThemedText variant="bodyMedium" tone="secondary" numberOfLines={1}>
                    {animeSubtitle}
                    {anime?.city ? ` · ${anime.city}` : ''}
                  </ThemedText>
                ) : anime?.city ? (
                  <ThemedText variant="bodyMedium" tone="secondary" numberOfLines={1}>
                    {anime.city}
                  </ThemedText>
                ) : null}

                {anime ? (
                  <Pressable
                    onPress={handleOpenBrowse}
                    style={({ pressed }) => [
                      styles.browseBtn,
                      {
                        borderColor: `${themeColor}99`,
                        backgroundColor: `${theme.background.primary}80`,
                      },
                      pressed && { opacity: 0.85 },
                    ]}
                    accessibilityRole="button">
                    <Ionicons name="open-outline" size={14} color={theme.text.primary} />
                    <ThemedText variant="captionSmall" weight="600">
                      Open in {browseLabel}
                    </ThemedText>
                  </Pressable>
                ) : null}
              </Animated.View>
            </View>

            {anime ? (
              <View style={styles.statsCard}>
                <StatCell
                  icon="place"
                  value={String(stats.spotCount)}
                  label={stats.spotCount === 1 ? 'scene' : 'scenes'}
                  color={themeColor}
                  theme={theme}
                />
                <View style={styles.statDivider} />
                <StatCell
                  icon="my-location"
                  value={stats.radiusKm > 0 ? `~${formatDistanceKm(stats.radiusKm)}` : '—'}
                  label="radius"
                  color={themeColor}
                  theme={theme}
                />
                <View style={styles.statDivider} />
                <StatCell
                  icon="check-circle"
                  value={`${stats.visitedCount}`}
                  label="visited"
                  color={stats.visitedCount > 0 ? theme.status.success : themeColor}
                  theme={theme}
                />
                <View style={styles.statDivider} />
                <StatCell
                  icon="photo-camera"
                  value={`${stats.capturedCount}`}
                  label="photos"
                  color={stats.capturedCount > 0 ? themeColor : theme.text.tertiary}
                  theme={theme}
                />
              </View>
            ) : null}

            {!isEmpty && anime ? (
              <>
                <View style={styles.tabsRow}>
                  <ViewModeTab
                    active={viewMode === 'list'}
                    label="List"
                    icon="view-list"
                    themeColor={themeColor}
                    themeColorFg={themeColorFg}
                    count={filteredGroupedSpots.length}
                    theme={theme}
                    onPress={() => handleViewToggle('list')}
                  />
                  <ViewModeTab
                    active={viewMode === 'map'}
                    label="Map"
                    icon="map"
                    themeColor={themeColor}
                    themeColorFg={themeColorFg}
                    count={filteredPoints.filter((p) => hasValidGeo(p.geo)).length}
                    theme={theme}
                    onPress={() => handleViewToggle('map')}
                  />
                </View>

                {/* JapanWalker-style filter pills row. */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.pillsRow}>
                  <FilterPill
                    label="All"
                    active={spotFilter === 'all'}
                    badge={groupedCounts.all}
                    themeColor={themeColor}
                    themeColorFg={themeColorFg}
                    theme={theme}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => undefined);
                      setSpotFilter('all');
                    }}
                  />
                  <FilterPill
                    label="Unvisited"
                    active={spotFilter === 'unvisited'}
                    badge={groupedCounts.unvisited}
                    themeColor={themeColor}
                    themeColorFg={themeColorFg}
                    theme={theme}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => undefined);
                      setSpotFilter('unvisited');
                    }}
                  />
                  <FilterPill
                    label="Visited"
                    active={spotFilter === 'visited'}
                    badge={groupedCounts.visited}
                    themeColor={themeColor}
                    themeColorFg={themeColorFg}
                    theme={theme}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => undefined);
                      setSpotFilter('visited');
                    }}
                  />
                  <FilterPill
                    label="Photos"
                    active={spotFilter === 'photos'}
                    badge={groupedCounts.photos}
                    themeColor={themeColor}
                    themeColorFg={themeColorFg}
                    theme={theme}
                    icon="camera"
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => undefined);
                      setSpotFilter('photos');
                    }}
                  />
                </ScrollView>

                {viewMode === 'map' ? (
                  <View style={styles.sectionHeader}>
                    <ThemedText variant="titleLarge" weight="700">
                      Map view
                    </ThemedText>
                    <ThemedText variant="bodySmall" tone="tertiary">
                      Tap a marker to view the scene
                    </ThemedText>
                  </View>
                ) : (
                  <View style={styles.layoutToggleRow}>
                    <LayoutModeButton
                      icon="apps"
                      active={listLayout === 'grid'}
                      themeColor={themeColor}
                      themeColorFg={themeColorFg}
                      theme={theme}
                      accessibilityLabel="Album grid layout"
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => undefined);
                        setListLayout('grid');
                      }}
                    />
                    <LayoutModeButton
                      icon="reorder-three"
                      active={listLayout === 'rows'}
                      themeColor={themeColor}
                      themeColorFg={themeColorFg}
                      theme={theme}
                      accessibilityLabel="Compare rows layout"
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => undefined);
                        setListLayout('rows');
                      }}
                    />
                  </View>
                )}
              </>
            ) : null}

            {isEmpty ? (
              <View style={styles.emptyCard}>
                <MaterialIcons name="explore-off" size={36} color={theme.text.tertiary} />
                <ThemedText variant="titleMedium" weight="700" align="center">
                  No pilgrimage data yet for this anime
                </ThemedText>
                <ThemedText variant="bodySmall" tone="secondary" align="center">
                  Anitabi crowd-sources scene locations. Help fill the map by contributing on
                  anitabi.cn.
                </ThemedText>
                <Pressable
                  onPress={() => Linking.openURL('https://anitabi.cn').catch(() => undefined)}
                  style={({ pressed }) => [
                    styles.emptyBtn,
                    { backgroundColor: theme.accent },
                    pressed && { opacity: 0.85 },
                  ]}>
                  <Ionicons name="open-outline" size={14} color={readableTextOn(theme.accent)} />
                  <ThemedText
                    variant="bodySmall"
                    weight="700"
                    style={{ color: readableTextOn(theme.accent) }}>
                    Open Anitabi
                  </ThemedText>
                </Pressable>
              </View>
            ) : viewMode === 'list' ? (
              filteredGroupedSpots.length === 0 ? (
                <View style={styles.emptyCard}>
                  <ThemedText variant="bodyMedium" tone="secondary" align="center">
                    No scenes match this filter.
                  </ThemedText>
                </View>
              ) : listLayout === 'grid' ? (
                <View style={styles.gridList}>
                  {chunkPairs(filteredGroupedSpots).map((pair) => (
                    <View key={pair[0].id + (pair[1]?.id ?? '_solo')} style={styles.gridRow}>
                      {pair.map((gs) => {
                        const rep = representativeForGroup(gs);
                        const captured = gs.scenes.find((p) => captures[p.id]);
                        return (
                          <View key={gs.id} style={styles.gridCell}>
                            <SceneTile
                              spot={rep}
                              sceneCount={gs.scenes.length}
                              themeColor={themeColor}
                              themeColorFg={themeColorFg}
                              distanceKm={distanceForGroup(gs)}
                              visited={gs.scenes.some((p) => visited[p.id] === true)}
                              hasCapture={!!captured}
                              captureUri={captured ? (captures[captured.id]?.uri ?? null) : null}
                              theme={theme}
                              onPress={() => handleGroupedSpotPress(gs)}
                              onToggleVisited={() => handleToggleGroupedVisited(gs)}
                              onTakeComparison={handleFrameShot}
                            />
                          </View>
                        );
                      })}
                      {pair.length === 1 ? <View style={styles.gridCell} /> : null}
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.list}>
                  {filteredGroupedSpots.map((gs) => {
                    const rep = representativeForGroup(gs);
                    return (
                      <SpotRow
                        key={gs.id}
                        spot={rep}
                        sceneCount={gs.scenes.length}
                        themeColor={themeColor}
                        themeColorFg={themeColorFg}
                        distanceKm={distanceForGroup(gs)}
                        visited={gs.scenes.some((p) => visited[p.id] === true)}
                        hasCapture={gs.scenes.some((p) => !!captures[p.id])}
                        theme={theme}
                        onPress={() => handleGroupedSpotPress(gs)}
                        onToggleVisited={() => handleToggleGroupedVisited(gs)}
                        onOpenMaps={handleOpenMaps}
                      />
                    );
                  })}
                </View>
              )
            ) : (
              <>
                {filteredGroupedSpots.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.spotChipRow}>
                    {filteredGroupedSpots.map((gs) => {
                      const rep = representativeForGroup(gs);
                      return (
                        <SpotChip
                          key={gs.id}
                          spot={rep}
                          active={gs.scenes.some((p) => p.id === selectedSpotId)}
                          themeColor={themeColor}
                          themeColorFg={themeColorFg}
                          visited={gs.scenes.some((p) => visited[p.id] === true)}
                          hasCapture={gs.scenes.some((p) => !!captures[p.id])}
                          theme={theme}
                          onPress={handleSpotChipPress}
                        />
                      );
                    })}
                  </ScrollView>
                ) : null}
                <View
                  style={[
                    styles.mapWrap,
                    { borderColor: theme.glassBorder, backgroundColor: theme.background.secondary },
                  ]}>
                  <SpotMapView
                    spots={filteredPoints}
                    visited={visited}
                    ringColor={themeColor}
                    userLocation={userLocation}
                    centerGeo={anime?.geo ?? null}
                    centerZoom={anime?.zoom ?? 12}
                    focusSpotId={selectedSpotId}
                    theme={theme}
                    onSpotPress={(spot) => {
                      Haptics.selectionAsync().catch(() => undefined);
                      setSelectedSpotId(spot.id);
                      setActiveSpot(spot);
                    }}
                    onClusterPick={(picked) => {
                      Haptics.selectionAsync().catch(() => undefined);
                      setClusterSpots(picked);
                    }}
                    style={styles.mapInner}
                  />
                </View>
              </>
            )}
          </Animated.ScrollView>
        )}

        <SpotSheet
          spot={activeSpot}
          animeId={animeId ?? ''}
          themeColor={themeColor}
          themeColorFg={themeColorFg}
          distanceKm={activeSpotDistance}
          visited={activeSpotVisited}
          hasCapture={activeSpotHasCapture}
          theme={theme}
          onClose={() => setActiveSpot(null)}
          onToggleVisited={handleToggleVisited}
          onOpenMaps={handleOpenMaps}
          onFrameShot={handleFrameShot}
        />

        <SpotClusterPicker
          spots={clusterSpots}
          themeColor={themeColor}
          themeColorFg={themeColorFg}
          visited={visited}
          theme={theme}
          distanceFor={distanceFor}
          onClose={() => setClusterSpots(null)}
          onPick={(spot) => {
            Haptics.selectionAsync().catch(() => undefined);
            setClusterSpots(null);
            setActiveSpot(spot);
          }}
        />
      </View>
    </>
  );
}

interface FilterPillProps {
  label: string;
  active: boolean;
  badge: number;
  themeColor: string;
  themeColorFg: string;
  theme: ThemePalette;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
}

function FilterPill({
  label,
  active,
  badge,
  themeColor,
  themeColorFg,
  theme,
  icon,
  onPress,
}: FilterPillProps) {
  const styles = useMemo(() => makePillStyles(theme), [theme]);
  const fg = active ? themeColorFg : theme.text.secondary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        active
          ? { backgroundColor: themeColor, borderColor: themeColor }
          : { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <ThemedText variant="bodySmall" weight="600" style={{ color: fg }}>
        {label}
      </ThemedText>
      <View
        style={[
          styles.pillCount,
          active
            ? { backgroundColor: `${themeColorFg}22` }
            : { backgroundColor: theme.background.tertiary },
        ]}>
        <ThemedText variant="captionSmall" weight="700" style={{ color: fg }}>
          {badge}
        </ThemedText>
      </View>
    </Pressable>
  );
}

interface SpotChipProps {
  spot: AnitabiPoint;
  active: boolean;
  themeColor: string;
  themeColorFg: string;
  visited: boolean;
  hasCapture: boolean;
  theme: ThemePalette;
  onPress: (spot: AnitabiPoint) => void;
}

function SpotChip({
  spot,
  active,
  themeColor,
  themeColorFg,
  visited,
  hasCapture,
  theme,
  onPress,
}: SpotChipProps) {
  const styles = useMemo(() => makeSpotChipStyles(theme), [theme]);
  const label = getPilgrimageSpotTitles(spot).primary;
  return (
    <Pressable
      onPress={() => onPress(spot)}
      style={({ pressed }) => [
        styles.chip,
        active
          ? { borderColor: themeColor, backgroundColor: `${themeColor}1F` }
          : { borderColor: theme.glassBorder, backgroundColor: theme.background.secondary },
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Focus map on ${label}`}>
      <View
        style={[
          styles.epBadge,
          active ? { backgroundColor: themeColor } : { backgroundColor: theme.background.tertiary },
        ]}>
        <ThemedText
          variant="captionSmall"
          weight="800"
          style={{ color: active ? themeColorFg : theme.text.secondary }}>
          EP {spot.ep}
        </ThemedText>
      </View>
      <ThemedText
        variant="bodySmall"
        weight="600"
        numberOfLines={1}
        style={[styles.chipLabel, active ? { color: theme.text.primary } : null]}>
        {label}
      </ThemedText>
      {visited ? <Ionicons name="checkmark-circle" size={14} color={theme.status.success} /> : null}
      {hasCapture ? (
        <Ionicons name="camera" size={12} color={active ? themeColor : theme.text.tertiary} />
      ) : null}
    </Pressable>
  );
}

interface SpotClusterPickerProps {
  spots: readonly AnitabiPoint[] | null;
  themeColor: string;
  themeColorFg: string;
  visited: VisitedMap;
  theme: ThemePalette;
  distanceFor: (spot: AnitabiPoint) => number | null;
  onClose: () => void;
  onPick: (spot: AnitabiPoint) => void;
}

function SpotClusterPicker({
  spots,
  themeColor,
  themeColorFg,
  visited,
  theme,
  distanceFor,
  onClose,
  onPick,
}: SpotClusterPickerProps) {
  const styles = useMemo(() => makePickerStyles(theme), [theme]);
  if (!spots || spots.length === 0) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <SafeAreaView edges={['bottom']}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <ThemedText variant="titleMedium" weight="700">
                {spots.length} scenes here
              </ThemedText>
              <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={theme.text.secondary} />
              </Pressable>
            </View>
            <FlatList
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              data={spots}
              keyExtractor={(spot) => spot.id}
              initialNumToRender={12}
              windowSize={9}
              renderItem={({ item: spot }) => {
                const isVisited = visited[spot.id] === true;
                const km = distanceFor(spot);
                const titles = getPilgrimageSpotTitles(spot);
                return (
                  <Pressable
                    onPress={() => onPick(spot)}
                    style={({ pressed }) => [
                      styles.row,
                      isVisited && { borderColor: `${theme.status.success}66` },
                      pressed && { opacity: 0.78 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${titles.primary}`}>
                    <View style={[styles.thumbWrap, { borderColor: themeColor }]}>
                      <Image
                        source={{ uri: spot.image }}
                        style={styles.thumb}
                        contentFit="cover"
                        transition={120}
                      />
                      {spot.ep > 0 ? (
                        <View style={[styles.epPill, { backgroundColor: `${themeColor}E6` }]}>
                          <ThemedText
                            variant="captionSmall"
                            weight="800"
                            style={{ color: themeColorFg }}>
                            EP {spot.ep}
                          </ThemedText>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.rowBody}>
                      <ThemedText variant="bodyMedium" weight="700" numberOfLines={2}>
                        {titles.primary}
                      </ThemedText>
                      {titles.secondary ? (
                        <ThemedText
                          variant="bodySmall"
                          tone="secondary"
                          numberOfLines={1}
                          style={{ marginTop: 1 }}>
                          {titles.secondary}
                        </ThemedText>
                      ) : null}
                      {km != null ? (
                        <ThemedText
                          variant="captionSmall"
                          tone="tertiary"
                          weight="500"
                          style={{ marginTop: 3 }}>
                          {formatDistanceKm(km)} away
                        </ThemedText>
                      ) : null}
                    </View>
                    {isVisited ? (
                      <Ionicons name="checkmark-circle" size={20} color={theme.status.success} />
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color={theme.text.tertiary} />
                    )}
                  </Pressable>
                );
              }}
            />
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

interface StatCellProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  value: string;
  label: string;
  color: string;
  theme: ThemePalette;
}

function StatCell({ icon, value, label, color, theme }: StatCellProps) {
  const styles = useMemo(() => makeStatStyles(theme), [theme]);
  return (
    <View style={styles.cell}>
      <MaterialIcons name={icon} size={16} color={color} />
      <ThemedText variant="bodyMedium" weight="700">
        {value}
      </ThemedText>
      <ThemedText variant="captionSmall" tone="secondary" weight="500">
        {label}
      </ThemedText>
    </View>
  );
}

interface ViewModeTabProps {
  active: boolean;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  themeColor: string;
  themeColorFg: string;
  count?: number;
  theme: ThemePalette;
  onPress: () => void;
}

function ViewModeTab({
  active,
  label,
  icon,
  themeColor,
  themeColorFg,
  count,
  theme,
  onPress,
}: ViewModeTabProps) {
  const styles = useMemo(() => makeTabStyles(theme), [theme]);
  const fg = active ? themeColor : theme.text.secondary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tab,
        active
          ? {
              backgroundColor: `${themeColor}14`,
              borderColor: themeColor,
              borderWidth: 1.5,
            }
          : {
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
              borderWidth: 1,
            },
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}>
      <MaterialIcons name={icon} size={14} color={fg} />
      <ThemedText variant="bodySmall" weight="600" style={{ color: fg }}>
        {label}
      </ThemedText>
      {count !== undefined ? (
        <View
          style={[
            styles.countBadge,
            { backgroundColor: active ? `${themeColor}22` : theme.background.tertiary },
          ]}>
          <ThemedText variant="captionSmall" weight="700" style={{ color: fg }}>
            {count}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

function makeStyles(theme: ThemePalette, topInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background.primary },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    errorContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.xl,
      gap: Spacing.sm,
    },
    backBtn: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs + 2,
      borderRadius: Radius.md,
    },
    scroll: { paddingBottom: 48 },
    heroWrap: {
      height: HERO_HEIGHT,
      overflow: 'hidden',
      position: 'relative',
    },
    heroImageWrap: {
      ...StyleSheet.absoluteFillObject,
    },
    heroImage: {
      width: '100%',
      height: '100%',
      backgroundColor: theme.background.secondary,
    },
    heroGradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: HERO_HEIGHT * 0.85,
    },
    heroOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: Spacing.screenPadding,
      paddingBottom: Spacing.lg,
      gap: 6,
    },
    heroSpotBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: Radius.full,
      borderWidth: 1,
    },
    browseBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: Radius.full,
      borderWidth: 1,
      marginTop: 6,
    },
    // Sticky header lives above the scroll so the hero image scrolls under it.
    headerWrap: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      height: topInset + HEADER_HEIGHT,
    },
    headerBackdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    headerBackdropBorder: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: StyleSheet.hairlineWidth,
    },
    headerStickyTitle: {
      position: 'absolute',
      left: 60,
      right: 120,
      top: topInset,
      height: HEADER_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerActions: {
      position: 'absolute',
      top: topInset,
      left: 0,
      right: 0,
      height: HEADER_HEIGHT,
      paddingHorizontal: Spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerRightGroup: {
      flexDirection: 'row',
      gap: 10,
    },
    statsCard: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: Spacing.screenPadding,
      marginTop: Spacing.md,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.sm,
      borderRadius: Radius.lg,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    statDivider: {
      width: 1,
      height: 28,
      backgroundColor: theme.glassBorder,
    },
    tabsRow: {
      flexDirection: 'row',
      gap: Spacing.xs,
      marginHorizontal: Spacing.screenPadding,
      marginTop: Spacing.md,
      marginBottom: Spacing.sm,
    },
    pillsRow: {
      gap: 8,
      paddingHorizontal: Spacing.screenPadding,
      paddingVertical: 4,
    },
    spotChipRow: {
      gap: 8,
      paddingHorizontal: Spacing.screenPadding,
      paddingTop: Spacing.xs,
      paddingBottom: Spacing.xs,
    },
    sectionHeader: {
      paddingHorizontal: Spacing.screenPadding,
      marginTop: Spacing.sm,
      marginBottom: Spacing.xs,
      gap: 2,
    },
    list: {
      paddingHorizontal: Spacing.screenPadding,
      gap: Spacing.sm,
      paddingTop: Spacing.xs,
    },
    layoutToggleRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 6,
      paddingHorizontal: Spacing.screenPadding,
      paddingTop: Spacing.xs,
    },
    gridList: {
      paddingHorizontal: Spacing.screenPadding,
      gap: 10,
      paddingTop: Spacing.sm,
    },
    gridRow: {
      flexDirection: 'row',
      gap: 10,
    },
    gridCell: {
      flex: 1,
    },
    mapWrap: {
      height: 480,
      marginHorizontal: Spacing.screenPadding,
      marginTop: Spacing.xs,
      borderRadius: Radius.cardLg,
      overflow: 'hidden',
      borderWidth: 1,
    },
    mapInner: { flex: 1 },
    emptyCard: {
      marginHorizontal: Spacing.screenPadding,
      marginTop: Spacing.lg,
      paddingVertical: Spacing.xl,
      paddingHorizontal: Spacing.lg,
      backgroundColor: theme.background.secondary,
      borderColor: theme.glassBorder,
      borderWidth: 1,
      borderRadius: Radius.cardLg,
      alignItems: 'center',
      gap: Spacing.xs,
    },
    emptyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: Radius.full,
      marginTop: Spacing.xs,
    },
  });
}

function makeHeaderStyles(theme: ThemePalette) {
  return StyleSheet.create({
    roundBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${theme.background.secondary}CC`,
      borderWidth: 1,
    },
  });
}

function makeStatStyles(theme: ThemePalette) {
  return StyleSheet.create({
    cell: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
      gap: 2,
    },
  });
}

function makeTabStyles(theme: ThemePalette) {
  return StyleSheet.create({
    tab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 12,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    countBadge: {
      minWidth: 20,
      height: 18,
      paddingHorizontal: 5,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

function makePillStyles(theme: ThemePalette) {
  return StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: Radius.full,
      borderWidth: 1,
    },
    pillCount: {
      minWidth: 22,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

function makeSpotChipStyles(theme: ThemePalette) {
  return StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingLeft: 6,
      paddingRight: 12,
      paddingVertical: 6,
      borderRadius: Radius.full,
      borderWidth: 1,
      maxWidth: 220,
      minHeight: 36,
    },
    epBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: Radius.full,
      minWidth: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipLabel: {
      flexShrink: 1,
      color: theme.text.secondary,
    },
  });
}

function makeRowStyles(theme: ThemePalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.background.secondary,
      borderColor: theme.glassBorder,
      borderWidth: 1,
      borderRadius: 16,
      padding: 12,
      gap: 10,
    },
    imageRow: {
      flexDirection: 'row',
      gap: 6,
      height: 120,
    },
    imageHalf: {
      flex: 1,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: theme.background.tertiary,
      position: 'relative',
    },
    imgFull: {
      width: '100%',
      height: '100%',
    },
    labelChip: {
      position: 'absolute',
      top: 6,
      left: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: 'rgba(10,10,10,0.7)',
    },
    labelText: {
      color: ON_DARK,
      fontSize: 9,
      letterSpacing: 0.5,
    },
    captureDot: {
      position: 'absolute',
      bottom: 6,
      right: 6,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: theme.accent,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    infoCol: {
      flex: 1,
      gap: 3,
      minWidth: 0,
    },
    epRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flexWrap: 'wrap',
    },
    dot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      opacity: 0.6,
    },
    actionsCol: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    visitPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: 1,
    },
    iconPill: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

function makeTileStyles(theme: ThemePalette) {
  return StyleSheet.create({
    tile: {
      aspectRatio: 1,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: theme.background.tertiary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      position: 'relative',
    },
    image: {
      ...StyleSheet.absoluteFillObject,
    },
    baseMask: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.12)',
    },
    captionGradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '55%',
    },
    cornerBadge: {
      position: 'absolute',
      top: 8,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cornerLeft: { left: 8 },
    cornerRight: { right: 8 },
    captionWrap: {
      position: 'absolute',
      left: 10,
      right: 10,
      bottom: 9,
      gap: 1,
    },
    captionTitle: {
      color: ON_DARK,
      textShadowColor: 'rgba(0,0,0,0.55)',
      textShadowRadius: 4,
    },
    captionMeta: {
      color: 'rgba(255,255,255,0.85)',
      textShadowColor: 'rgba(0,0,0,0.45)',
      textShadowRadius: 3,
    },
    flipBtn: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

function makeSheetStyles(theme: ThemePalette) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: theme.background.secondary,
      borderTopLeftRadius: Radius.xxl,
      borderTopRightRadius: Radius.xxl,
      borderColor: theme.glassBorder,
      borderTopWidth: 1,
      paddingHorizontal: Spacing.screenPadding,
      paddingTop: 8,
      paddingBottom: Spacing.md,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.glassBorder,
      marginBottom: Spacing.sm,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
      marginBottom: Spacing.md,
    },
    cover: {
      width: 88,
      height: 88,
      borderRadius: Radius.md,
      backgroundColor: theme.background.tertiary,
    },
    headerText: {
      flex: 1,
      minWidth: 0,
    },
    epPill: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      marginBottom: 6,
    },
    closeBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 16,
      backgroundColor: theme.background.tertiary,
    },
    actions: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 44,
      borderRadius: Radius.md,
    },
    frameShotBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 44,
      borderRadius: Radius.md,
      marginTop: Spacing.sm,
      borderWidth: 1,
    },
    frameShotDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginLeft: 4,
    },
  });
}

function makePickerStyles(theme: ThemePalette) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: theme.background.secondary,
      borderTopLeftRadius: Radius.xxl,
      borderTopRightRadius: Radius.xxl,
      borderColor: theme.glassBorder,
      borderTopWidth: 1,
      paddingHorizontal: Spacing.screenPadding,
      paddingTop: 8,
      paddingBottom: Spacing.sm,
      maxHeight: '70%',
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.glassBorder,
      marginBottom: Spacing.xs,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Spacing.xs,
      marginBottom: Spacing.xs,
    },
    closeBtn: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 15,
      backgroundColor: theme.background.tertiary,
    },
    list: {
      marginTop: 4,
    },
    listContent: {
      paddingBottom: Spacing.md,
      gap: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.background.secondary,
      borderColor: theme.glassBorder,
      borderWidth: 1,
      borderRadius: Radius.lg,
      padding: 10,
    },
    thumbWrap: {
      width: 60,
      height: 60,
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 2,
      backgroundColor: theme.background.tertiary,
      position: 'relative',
    },
    thumb: {
      width: '100%',
      height: '100%',
    },
    epPill: {
      position: 'absolute',
      left: 4,
      bottom: 4,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 5,
    },
    rowBody: {
      flex: 1,
      minWidth: 0,
    },
  });
}

function makeMapStyles(theme: ThemePalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
    },
    webview: {
      flex: 1,
      backgroundColor: theme.background.secondary,
    },
    fallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      backgroundColor: theme.background.secondary,
      gap: 8,
    },
    fallbackTitle: {
      marginTop: 8,
    },
  });
}
