// Pilgrimage detail screen.
// Path: /pilgrimage/{bangumiId}
//
// Spec: spec/pilgrimage_spec.md §8 (Routes).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { pilgrimageRepository } from '../../libs/services/pilgrimage/pilgrimage-repository';
import { anitabiService } from '../../libs/services/pilgrimage/anitabi-service';
import { locationService, type LatLng } from '../../libs/services/pilgrimage/location-service';
import {
  LEAFLET_CSS,
  LEAFLET_JS,
  LEAFLET_MARKERCLUSTER_CSS,
  LEAFLET_MARKERCLUSTER_JS,
} from '../../libs/services/pilgrimage/leaflet-assets';
import {
  MAP_BASE_BODY,
  MAP_BASE_CSS,
  MAP_BASE_JS,
  MAP_BASE_URL,
  TILE_URL,
} from '../../libs/services/pilgrimage/leaflet-map';
import {
  loadVisitedSpots,
  saveVisitedSpots,
  type VisitedMap,
} from '../../libs/services/pilgrimage/visited-prefs';
import { dataSourceConfig, isSupportedBrowseSource } from '../../libs/services/data-source-config';
import { PLATFORM_CONFIGS, type PlatformType } from '../../libs/services/auth/types';
import type {
  AnitabiBangumi,
  AnitabiPoint,
  AnitabiPointDetail,
} from '../../libs/services/pilgrimage/types';

type ViewMode = 'list' | 'map';

const HERO_HEIGHT = 280;
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

function buildBrowseUrl(platform: PlatformType, bangumiId: number): string | null {
  // Anitabi is the source of truth for the spot dataset; for non-bangumi
  // browse sources we still surface Anitabi's bangumi page since that is
  // the location the data originates from.
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
}): string {
  const initialJson = JSON.stringify(initial).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>${LEAFLET_CSS}</style>
<style>${LEAFLET_MARKERCLUSTER_CSS}</style>
<style>${MAP_BASE_CSS}</style>
<style>
  .spot-marker {
    width: 40px; height: 40px; border-radius: 12px;
    border: 2px solid var(--ring, #FF9F0A);
    background: #1c1c1e; overflow: hidden; position: relative;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 10px rgba(0,0,0,0.35);
    transition: transform .15s ease;
  }
  .spot-marker:active { transform: scale(0.94); }
  .spot-marker img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .spot-marker.visited { border-color: #30D158; border-width: 3px; }
  .spot-marker .ep {
    position: absolute; bottom: -6px; right: -6px;
    background: #1c1c1e; color: #fff;
    border: 2px solid var(--ring, #FF9F0A);
    border-radius: 8px; padding: 1px 5px;
    font: 700 9px -apple-system, system-ui, sans-serif;
  }
  .spot-marker.visited .ep { border-color: #30D158; color: #30D158; }
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
  new window.CachedTileLayer(${JSON.stringify(TILE_URL)}, {
    maxZoom: 18,
    minZoom: 3,
    attribution: '&copy; OpenStreetMap',
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
    if (lastBounds) {
      try { map.flyToBounds(lastBounds, { padding: [40, 40], maxZoom: 15, duration: 0.4 }); return; } catch (e) {}
    }
    map.flyTo(initialCenter, initialZoom, { duration: 0.4 });
  });

  // Cluster group keyed to the anime's theme color. Disables one zoom level
  // earlier than the overview map because spots tend to cluster on the same
  // street, and users want to see individual scenes once they're close.
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
        var html = '<div class="' + cls + '" style="--ring:' + m.ringColor + '">' +
          (m.image ? '<img src="' + m.image + '" loading="lazy" />' : '') +
          '<span class="ep">EP ' + m.ep + '</span>' +
        '</div>';
        var icon = L.divIcon({ className: '', html: html, iconSize: [40,40], iconAnchor: [20,20] });
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
    if (!didFit && bounds.length > 1) {
      try { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: false }); didFit = true; } catch (e) {}
    } else if (!didFit && bounds.length === 1) {
      try { map.setView(bounds[0], 14, { animate: false }); didFit = true; } catch (e) {}
    }
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
  onSpotPress: (spot: AnitabiPoint) => void;
  onClusterPick: (spots: readonly AnitabiPoint[]) => void;
  style?: StyleProp<ViewStyle>;
}

function SpotMapView({
  spots,
  visited,
  ringColor,
  userLocation,
  centerGeo,
  centerZoom,
  onSpotPress,
  onClusterPick,
  style,
}: SpotMapViewProps) {
  const webviewRef = useRef<WebView>(null);
  const spotsById = useRef(new Map<string, AnitabiPoint>());
  const [ready, setReady] = useState(false);

  // Stable shell — initial center + theme color captured once. Marker updates
  // flow via injectJavaScript so toggling visited or loading detailed points
  // doesn't throw away the cached tiles or reset the user's pan/zoom.
  const html = useMemo(() => {
    const fallback =
      centerGeo && hasValidGeo(centerGeo)
        ? { lat: centerGeo[0], lng: centerGeo[1], zoom: centerZoom || 12 }
        : { lat: 36.2048, lng: 138.2529, zoom: 5 };
    const user = userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : null;
    return buildSpotMapHtml({ center: fallback, user, ringColor });
    // Captured once on mount intentionally — see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markers = useMemo(() => {
    const out: MapMarkerPayload[] = [];
    spotsById.current.clear();
    for (const spot of spots) {
      if (!hasValidGeo(spot.geo)) continue;
      spotsById.current.set(spot.id, spot);
      out.push({
        id: spot.id,
        lat: spot.geo[0],
        lng: spot.geo[1],
        title: spot.name,
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
    <View style={[mapStyles.container, style]} testID="pilgrimage-spot-map">
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
        style={mapStyles.webview}
        renderError={() => (
          <View style={mapStyles.fallback}>
            <Ionicons name="map-outline" size={32} color={Colors.text.secondary} />
            <Text style={mapStyles.fallbackTitle}>Map unavailable</Text>
            <Text style={mapStyles.fallbackBody}>
              Couldn&apos;t load the map. Check your connection and try again.
            </Text>
          </View>
        )}
        startInLoadingState
      />
    </View>
  );
}

interface SpotRowProps {
  spot: AnitabiPoint;
  themeColor: string;
  distanceKm: number | null;
  visited: boolean;
  onToggleVisited: (spot: AnitabiPoint) => void;
  onOpenMaps: (spot: AnitabiPoint) => void;
}

function SpotRow({
  spot,
  themeColor,
  distanceKm,
  visited,
  onToggleVisited,
  onOpenMaps,
}: SpotRowProps) {
  const hasGeo = hasValidGeo(spot.geo);
  return (
    <View style={[rowStyles.row, visited && rowStyles.rowVisited]}>
      <View style={rowStyles.thumbWrap}>
        <Image
          source={{ uri: spot.image }}
          style={rowStyles.thumb}
          contentFit="cover"
          transition={150}
        />
        <View style={[rowStyles.epBadge, { backgroundColor: `${themeColor}E6` }]}>
          <Text style={rowStyles.epBadgeText}>EP {spot.ep}</Text>
        </View>
      </View>
      <View style={rowStyles.body}>
        <Text style={rowStyles.name} numberOfLines={2}>
          {spot.name}
        </Text>
        {spot.cn ? (
          <Text style={rowStyles.nameCN} numberOfLines={1}>
            {spot.cn}
          </Text>
        ) : null}
        <View style={rowStyles.metaRow}>
          {distanceKm != null ? (
            <View style={rowStyles.metaTag}>
              <Ionicons name="navigate" size={11} color={Colors.text.secondary} />
              <Text style={rowStyles.metaText}>{formatDistanceKm(distanceKm)}</Text>
            </View>
          ) : null}
          {!hasGeo ? (
            <View style={rowStyles.metaTag}>
              <Ionicons name="alert-circle" size={11} color={Colors.text.tertiary} />
              <Text style={rowStyles.metaTextDim}>No coordinates</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={rowStyles.actions}>
        <Pressable
          onPress={() => onToggleVisited(spot)}
          style={({ pressed }) => [
            rowStyles.actionBtn,
            visited && rowStyles.actionBtnVisited,
            pressed && rowStyles.actionBtnPressed,
          ]}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: visited }}
          accessibilityLabel={visited ? 'Mark as not visited' : 'Mark as visited'}
          hitSlop={8}>
          <Ionicons
            name={visited ? 'checkmark-circle' : 'checkmark-circle-outline'}
            size={22}
            color={visited ? Colors.success : Colors.text.secondary}
          />
        </Pressable>
        <Pressable
          onPress={() => onOpenMaps(spot)}
          disabled={!hasGeo}
          style={({ pressed }) => [
            rowStyles.actionBtn,
            !hasGeo && rowStyles.actionBtnDisabled,
            pressed && hasGeo && rowStyles.actionBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Directions to ${spot.name}`}
          hitSlop={8}>
          <MaterialIcons
            name="directions"
            size={22}
            color={hasGeo ? Colors.accent : Colors.text.tertiary}
          />
        </Pressable>
      </View>
    </View>
  );
}

interface SpotSheetProps {
  spot: AnitabiPoint | null;
  themeColor: string;
  distanceKm: number | null;
  visited: boolean;
  onClose: () => void;
  onToggleVisited: (spot: AnitabiPoint) => void;
  onOpenMaps: (spot: AnitabiPoint) => void;
}

function SpotSheet({
  spot,
  themeColor,
  distanceKm,
  visited,
  onClose,
  onToggleVisited,
  onOpenMaps,
}: SpotSheetProps) {
  if (!spot) return null;
  const hasGeo = hasValidGeo(spot.geo);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={sheetStyles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={sheetStyles.sheet}>
          <SafeAreaView edges={['bottom']}>
            <View style={sheetStyles.handle} />
            <View style={sheetStyles.headerRow}>
              <Image
                source={{ uri: spot.image }}
                style={sheetStyles.cover}
                contentFit="cover"
                transition={150}
              />
              <View style={sheetStyles.headerText}>
                <View style={[sheetStyles.epPill, { backgroundColor: `${themeColor}E6` }]}>
                  <Text style={sheetStyles.epPillText}>EP {spot.ep}</Text>
                </View>
                <Text style={sheetStyles.title} numberOfLines={2}>
                  {spot.name}
                </Text>
                {spot.cn ? (
                  <Text style={sheetStyles.subtitle} numberOfLines={1}>
                    {spot.cn}
                  </Text>
                ) : null}
                {distanceKm != null ? (
                  <Text style={sheetStyles.distance}>{formatDistanceKm(distanceKm)} away</Text>
                ) : null}
              </View>
              <Pressable onPress={onClose} hitSlop={12} style={sheetStyles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.text.secondary} />
              </Pressable>
            </View>

            <View style={sheetStyles.actions}>
              <Pressable
                onPress={() => onToggleVisited(spot)}
                style={({ pressed }) => [
                  sheetStyles.actionBtn,
                  visited
                    ? { backgroundColor: Colors.success }
                    : {
                        backgroundColor: Colors.glass.medium,
                        borderColor: Colors.glass.border,
                        borderWidth: 1,
                      },
                  pressed && { opacity: 0.85 },
                ]}>
                <Ionicons
                  name={visited ? 'checkmark-circle' : 'checkmark-circle-outline'}
                  size={18}
                  color={visited ? '#000' : Colors.text.primary}
                />
                <Text
                  style={[
                    sheetStyles.actionBtnText,
                    { color: visited ? '#000' : Colors.text.primary },
                  ]}>
                  {visited ? 'Visited' : 'Mark visited'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => onOpenMaps(spot)}
                disabled={!hasGeo}
                style={({ pressed }) => [
                  sheetStyles.actionBtn,
                  hasGeo
                    ? { backgroundColor: Colors.accent }
                    : {
                        backgroundColor: Colors.glass.dark,
                        borderColor: Colors.glass.border,
                        borderWidth: 1,
                      },
                  pressed && hasGeo && { opacity: 0.85 },
                ]}>
                <MaterialIcons
                  name="directions"
                  size={18}
                  color={hasGeo ? '#FFF' : Colors.text.tertiary}
                />
                <Text
                  style={[
                    sheetStyles.actionBtnText,
                    { color: hasGeo ? '#FFF' : Colors.text.tertiary },
                  ]}>
                  Directions
                </Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

export default function PilgrimageDetailScreen() {
  const { animeId } = useLocalSearchParams<{ animeId: string }>();
  const router = useRouter();
  const bangumiId = Number(animeId);

  const [anime, setAnime] = useState<AnitabiBangumi | null>(null);
  const [points, setPoints] = useState<readonly AnitabiPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [visited, setVisited] = useState<VisitedMap>({});
  const [browseSource, setBrowseSource] = useState<PlatformType>(dataSourceConfig.browseSource);
  const [activeSpot, setActiveSpot] = useState<AnitabiPoint | null>(null);
  const [clusterSpots, setClusterSpots] = useState<readonly AnitabiPoint[] | null>(null);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const themeColor = anime?.color || Colors.primary;

  useEffect(() => {
    let cancelled = false;
    if (!Number.isFinite(bangumiId) || bangumiId <= 0) {
      setError('Invalid anime id');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    pilgrimageRepository
      .getSpotsByBangumiId(bangumiId)
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
        try {
          const detailed: AnitabiPointDetail[] = await anitabiService.getDetailedPoints(bangumiId);
          if (!cancelled && detailed.length > 0) {
            setPoints(detailed);
          }
        } catch {
          // Lite data is enough; ignore.
        }
        setLoading(false);
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

  const stats = useMemo(() => {
    const spotCount = anime?.pointsLength ?? points.length;
    const visitedCount = points.reduce((acc, p) => (visited[p.id] ? acc + 1 : acc), 0);
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
    return { spotCount, visitedCount, radiusKm };
  }, [anime, points, visited]);

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

  const heroAnimatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      scrollY.value,
      [-HERO_HEIGHT, 0, HERO_HEIGHT],
      [-HERO_HEIGHT / 2, 0, HERO_HEIGHT * 0.4],
      Extrapolation.CLAMP
    );
    const scale = interpolate(scrollY.value, [-HERO_HEIGHT, 0], [1.5, 1], Extrapolation.CLAMP);
    return {
      transform: [{ translateY }, { scale }],
    };
  });

  const browseLabel = useMemo(() => {
    const platform = isSupportedBrowseSource(browseSource) ? browseSource : 'bangumi';
    return PLATFORM_CONFIGS[platform]?.displayName ?? 'Browse';
  }, [browseSource]);

  const activeSpotVisited = activeSpot ? visited[activeSpot.id] === true : false;
  const activeSpotDistance = activeSpot ? distanceFor(activeSpot) : null;
  const isEmpty = !loading && !error && (!anime || points.length === 0);

  return (
    <>
      <Stack.Screen
        options={{
          title: anime?.title ?? 'Pilgrimage',
          headerLargeTitle: false,
        }}
      />
      <View style={styles.container}>
        <LinearGradient
          colors={Colors.gradients.background as unknown as [string, string, ...string[]]}
          style={StyleSheet.absoluteFill}
        />

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : error ? (
          <SafeAreaView style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Couldn&apos;t load pilgrimage</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>Go back</Text>
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
                  source={{ uri: (anime?.cover ?? '').replace('?plan=h160', '?plan=h720') }}
                  style={styles.heroImage}
                  contentFit="cover"
                  transition={250}
                />
              </Animated.View>
              <LinearGradient
                colors={['transparent', 'rgba(8,8,8,0.55)', 'rgba(8,8,8,0.95)']}
                style={styles.heroGradient}
              />
              <View style={styles.heroOverlay}>
                <Text style={styles.heroTitle} numberOfLines={2}>
                  {anime?.title ?? ''}
                </Text>
                {anime?.cn ? (
                  <Text style={styles.heroSubtitle} numberOfLines={1}>
                    {anime.cn}
                    {anime.city ? ` · ${anime.city}` : ''}
                  </Text>
                ) : anime?.city ? (
                  <Text style={styles.heroSubtitle} numberOfLines={1}>
                    {anime.city}
                  </Text>
                ) : null}

                {anime ? (
                  <Pressable
                    onPress={handleOpenBrowse}
                    style={({ pressed }) => [
                      styles.browseBtn,
                      { borderColor: `${themeColor}99` },
                      pressed && { opacity: 0.85 },
                    ]}
                    accessibilityRole="button">
                    <Ionicons name="open-outline" size={14} color="#FFFFFF" />
                    <Text style={styles.browseText}>Open in {browseLabel}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {anime ? (
              <View style={styles.statsCard}>
                <StatCell
                  icon="place"
                  value={String(stats.spotCount)}
                  label={stats.spotCount === 1 ? 'spot' : 'spots'}
                  color={themeColor}
                />
                <View style={styles.statDivider} />
                <StatCell
                  icon="my-location"
                  value={stats.radiusKm > 0 ? `~${formatDistanceKm(stats.radiusKm)}` : '—'}
                  label="radius"
                  color={themeColor}
                />
                <View style={styles.statDivider} />
                <StatCell
                  icon="check-circle"
                  value={`${stats.visitedCount}`}
                  label="visited"
                  color={stats.visitedCount > 0 ? Colors.success : themeColor}
                />
              </View>
            ) : null}

            {!isEmpty && anime ? (
              <View style={styles.tabsRow}>
                <ViewModeTab
                  active={viewMode === 'list'}
                  label="List"
                  icon="view-list"
                  themeColor={themeColor}
                  onPress={() => handleViewToggle('list')}
                />
                <ViewModeTab
                  active={viewMode === 'map'}
                  label="Map"
                  icon="map"
                  themeColor={themeColor}
                  onPress={() => handleViewToggle('map')}
                />
              </View>
            ) : null}

            {isEmpty ? (
              <View style={styles.emptyCard}>
                <MaterialIcons name="explore-off" size={36} color={Colors.text.tertiary} />
                <Text style={styles.emptyTitle}>No pilgrimage data yet for this anime</Text>
                <Text style={styles.emptyBody}>
                  Anitabi crowd-sources scene locations. Help fill the map by contributing on
                  anitabi.cn.
                </Text>
                <Pressable
                  onPress={() => Linking.openURL('https://anitabi.cn').catch(() => undefined)}
                  style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.85 }]}>
                  <Ionicons name="open-outline" size={14} color="#000" />
                  <Text style={styles.emptyBtnText}>Open Anitabi</Text>
                </Pressable>
              </View>
            ) : viewMode === 'list' ? (
              <View style={styles.list}>
                {points.map((spot) => (
                  <SpotRow
                    key={spot.id}
                    spot={spot}
                    themeColor={themeColor}
                    distanceKm={distanceFor(spot)}
                    visited={visited[spot.id] === true}
                    onToggleVisited={handleToggleVisited}
                    onOpenMaps={handleOpenMaps}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.mapWrap}>
                <SpotMapView
                  spots={points}
                  visited={visited}
                  ringColor={themeColor}
                  userLocation={userLocation}
                  centerGeo={anime?.geo ?? null}
                  centerZoom={anime?.zoom ?? 12}
                  onSpotPress={(spot) => {
                    Haptics.selectionAsync().catch(() => undefined);
                    setActiveSpot(spot);
                  }}
                  onClusterPick={(picked) => {
                    Haptics.selectionAsync().catch(() => undefined);
                    setClusterSpots(picked);
                  }}
                  style={styles.mapInner}
                />
              </View>
            )}
          </Animated.ScrollView>
        )}

        <SpotSheet
          spot={activeSpot}
          themeColor={themeColor}
          distanceKm={activeSpotDistance}
          visited={activeSpotVisited}
          onClose={() => setActiveSpot(null)}
          onToggleVisited={handleToggleVisited}
          onOpenMaps={handleOpenMaps}
        />

        <SpotClusterPicker
          spots={clusterSpots}
          themeColor={themeColor}
          visited={visited}
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

interface SpotClusterPickerProps {
  spots: readonly AnitabiPoint[] | null;
  themeColor: string;
  visited: VisitedMap;
  distanceFor: (spot: AnitabiPoint) => number | null;
  onClose: () => void;
  onPick: (spot: AnitabiPoint) => void;
}

function SpotClusterPicker({
  spots,
  themeColor,
  visited,
  distanceFor,
  onClose,
  onPick,
}: SpotClusterPickerProps) {
  if (!spots || spots.length === 0) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={pickerStyles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={pickerStyles.sheet}>
          <SafeAreaView edges={['bottom']}>
            <View style={pickerStyles.handle} />
            <View style={pickerStyles.headerRow}>
              <Text style={pickerStyles.headerTitle}>{spots.length} scenes here</Text>
              <Pressable onPress={onClose} hitSlop={12} style={pickerStyles.closeBtn}>
                <Ionicons name="close" size={20} color={Colors.text.secondary} />
              </Pressable>
            </View>
            <ScrollView
              style={pickerStyles.list}
              contentContainerStyle={pickerStyles.listContent}
              showsVerticalScrollIndicator={false}>
              {spots.map((spot) => {
                const isVisited = visited[spot.id] === true;
                const km = distanceFor(spot);
                return (
                  <Pressable
                    key={spot.id}
                    onPress={() => onPick(spot)}
                    style={({ pressed }) => [
                      pickerStyles.row,
                      isVisited && { borderColor: `${Colors.success}66` },
                      pressed && { opacity: 0.78 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${spot.name}`}>
                    <View style={[pickerStyles.thumbWrap, { borderColor: themeColor }]}>
                      <Image
                        source={{ uri: spot.image }}
                        style={pickerStyles.thumb}
                        contentFit="cover"
                        transition={120}
                      />
                      <View style={[pickerStyles.epPill, { backgroundColor: `${themeColor}E6` }]}>
                        <Text style={pickerStyles.epText}>EP {spot.ep}</Text>
                      </View>
                    </View>
                    <View style={pickerStyles.rowBody}>
                      <Text style={pickerStyles.rowTitle} numberOfLines={2}>
                        {spot.name}
                      </Text>
                      {spot.cn ? (
                        <Text style={pickerStyles.rowSubtitle} numberOfLines={1}>
                          {spot.cn}
                        </Text>
                      ) : null}
                      {km != null ? (
                        <Text style={pickerStyles.rowMeta} numberOfLines={1}>
                          {formatDistanceKm(km)} away
                        </Text>
                      ) : null}
                    </View>
                    {isVisited ? (
                      <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color={Colors.text.tertiary} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
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
}

function StatCell({ icon, value, label, color }: StatCellProps) {
  return (
    <View style={statStyles.cell}>
      <MaterialIcons name={icon} size={16} color={color} />
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

interface ViewModeTabProps {
  active: boolean;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  themeColor: string;
  onPress: () => void;
}

function ViewModeTab({ active, label, icon, themeColor, onPress }: ViewModeTabProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        tabStyles.tab,
        active && { backgroundColor: themeColor },
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}>
      <MaterialIcons name={icon} size={16} color={active ? '#000' : Colors.text.secondary} />
      <Text style={[tabStyles.label, { color: active ? '#000' : Colors.text.secondary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  errorTitle: {
    color: Colors.text.primary,
    ...Typography.titleMedium,
  },
  errorText: {
    color: Colors.text.secondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  backBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.md,
  },
  backBtnText: { color: '#000', fontWeight: '700' },
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
    backgroundColor: Colors.background.secondary,
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: HERO_HEIGHT * 0.7,
  },
  heroOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: Spacing.md,
    gap: 4,
  },
  heroTitle: {
    color: Colors.text.primary,
    ...Typography.headlineMedium,
  },
  heroSubtitle: {
    color: Colors.text.secondary,
    ...Typography.bodyMedium,
    marginBottom: Spacing.xs,
  },
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    marginTop: 4,
  },
  browseText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.screenPadding,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.glass.medium,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.glass.border,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: Spacing.screenPadding,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.glass.dark,
    padding: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  list: {
    paddingHorizontal: Spacing.screenPadding,
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  mapWrap: {
    height: 480,
    marginHorizontal: Spacing.screenPadding,
    marginTop: Spacing.xs,
    borderRadius: Radius.cardLg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.background.secondary,
  },
  mapInner: { flex: 1 },
  emptyCard: {
    marginHorizontal: Spacing.screenPadding,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.glass.medium,
    borderColor: Colors.glass.border,
    borderWidth: 1,
    borderRadius: Radius.cardLg,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  emptyTitle: {
    color: Colors.text.primary,
    textAlign: 'center',
    ...Typography.titleMedium,
  },
  emptyBody: {
    color: Colors.text.secondary,
    textAlign: 'center',
    ...Typography.bodySmall,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    marginTop: Spacing.xs,
  },
  emptyBtnText: { color: '#000', fontSize: 13, fontWeight: '700' },
});

const statStyles = StyleSheet.create({
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 2,
  },
  value: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  label: {
    color: Colors.text.secondary,
    fontSize: 11,
    fontWeight: '500',
  },
});

const tabStyles = StyleSheet.create({
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    borderRadius: Radius.full,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: Colors.glass.medium,
    borderColor: Colors.glass.border,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: 10,
    gap: 12,
    alignItems: 'center',
  },
  rowVisited: {
    borderColor: `${Colors.success}66`,
    backgroundColor: `${Colors.success}14`,
  },
  thumbWrap: {
    position: 'relative',
    width: 84,
    height: 84,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.background.secondary,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  epBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  epBadgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  nameCN: {
    color: Colors.text.secondary,
    fontSize: 12,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.glass.dark,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  metaText: {
    color: Colors.text.secondary,
    fontSize: 11,
    fontWeight: '500',
  },
  metaTextDim: {
    color: Colors.text.tertiary,
    fontSize: 11,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'column',
    gap: 4,
    alignItems: 'center',
  },
  actionBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.glass.dark,
  },
  actionBtnVisited: {
    backgroundColor: `${Colors.success}26`,
  },
  actionBtnPressed: {
    opacity: 0.75,
  },
  actionBtnDisabled: {
    opacity: 0.4,
  },
});

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background.secondary,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    borderColor: Colors.glass.border,
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
    backgroundColor: Colors.glass.borderHeavy,
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
    backgroundColor: Colors.background.tertiary,
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
  epPillText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    color: Colors.text.primary,
    ...Typography.titleLarge,
    marginBottom: 2,
  },
  subtitle: {
    color: Colors.text.secondary,
    ...Typography.bodySmall,
    marginBottom: 4,
  },
  distance: {
    color: Colors.text.tertiary,
    fontSize: 11,
    fontWeight: '500',
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: Colors.glass.dark,
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
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});

const pickerStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background.secondary,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    borderColor: Colors.glass.border,
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
    backgroundColor: Colors.glass.borderHeavy,
    marginBottom: Spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  headerTitle: {
    ...Typography.titleMedium,
    color: Colors.text.primary,
  },
  closeBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: Colors.glass.dark,
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
    backgroundColor: Colors.glass.medium,
    borderColor: Colors.glass.border,
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
    backgroundColor: Colors.background.tertiary,
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
  epText: {
    color: '#000',
    fontSize: 9,
    fontWeight: '800',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  rowSubtitle: {
    color: Colors.text.secondary,
    fontSize: 12,
    marginTop: 1,
  },
  rowMeta: {
    color: Colors.text.tertiary,
    fontSize: 11,
    marginTop: 3,
    fontWeight: '500',
  },
});

const mapStyles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: Colors.background.secondary,
  },
  webview: {
    flex: 1,
    backgroundColor: Colors.background.secondary,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: Colors.background.secondary,
    gap: 8,
  },
  fallbackTitle: {
    ...Typography.titleMedium,
    color: Colors.text.primary,
    marginTop: 8,
  },
  fallbackBody: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
});
