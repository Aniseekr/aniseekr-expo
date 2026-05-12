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
  ActivityIndicator,
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
import { ThemedText, readableTextOn } from '../../../components/themed';
import { pilgrimageRepository } from '../../../libs/services/pilgrimage/pilgrimage-repository';
import { anitabiService } from '../../../libs/services/pilgrimage/anitabi-service';
import {
  listCaptures,
  type PilgrimageCapture,
} from '../../../libs/services/pilgrimage/captures';
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
  TILE_URL,
} from '../../../libs/services/pilgrimage/leaflet-map';
import {
  loadVisitedSpots,
  saveVisitedSpots,
  type VisitedMap,
} from '../../../libs/services/pilgrimage/visited-prefs';
import { dataSourceConfig, isSupportedBrowseSource } from '../../../libs/services/data-source-config';
import { PLATFORM_CONFIGS, type PlatformType } from '../../../libs/services/auth/types';
import { getNumberParam, getStringParam } from '../../../libs/utils/route-params';
import type {
  AnitabiBangumi,
  AnitabiPoint,
  AnitabiPointDetail,
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
  onSpotPress,
  onClusterPick,
  theme,
  style,
}: SpotMapViewProps) {
  const webviewRef = useRef<WebView>(null);
  const spotsById = useRef(new Map<string, AnitabiPoint>());
  const [ready, setReady] = useState(false);
  const styles = useMemo(() => makeMapStyles(theme), [theme]);

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

interface SpotRowProps {
  spot: AnitabiPoint;
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
      accessibilityLabel={`Open ${spot.name}`}>
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
            {spot.cn || spot.name}
          </ThemedText>
          <View style={styles.epRow}>
            <Ionicons name="film-outline" size={11} color={theme.text.tertiary} />
            <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
              EP {spot.ep} {spot.name && spot.cn ? `· ${spot.name}` : ''}
            </ThemedText>
            {distanceKm != null ? (
              <>
                <View style={[styles.dot, { backgroundColor: theme.text.tertiary }]} />
                <ThemedText
                  variant="captionSmall"
                  weight="600"
                  style={{ color: themeColor }}>
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
                backgroundColor: visited
                  ? theme.background.tertiary
                  : theme.background.secondary,
                borderColor: visited
                  ? `${theme.status.success}66`
                  : theme.glassBorder,
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
            accessibilityLabel={`Directions to ${spot.name}`}
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
                <ThemedText variant="titleLarge" weight="700" numberOfLines={2} style={{ marginBottom: 2 }}>
                  {spot.name}
                </ThemedText>
                {spot.cn ? (
                  <ThemedText variant="bodySmall" tone="secondary" numberOfLines={1} style={{ marginBottom: 4 }}>
                    {spot.cn}
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
                  style={{ color: visited ? readableTextOn(theme.status.success) : theme.text.primary }}>
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
                {hasCapture ? 'Reframe shot · 重新拍對比' : 'Frame shot · 拍對比照'}
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

function RoundHeaderButton({ icon, onPress, accessibilityLabel, tint, theme }: RoundHeaderButtonProps) {
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
  const [spotFilter, setSpotFilter] = useState<SpotFilter>('all');
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [visited, setVisited] = useState<VisitedMap>({});
  const [browseSource, setBrowseSource] = useState<PlatformType>(dataSourceConfig.browseSource);
  const [activeSpot, setActiveSpot] = useState<AnitabiPoint | null>(null);
  const [clusterSpots, setClusterSpots] = useState<readonly AnitabiPoint[] | null>(null);
  const [captures, setCaptures] = useState<Record<string, PilgrimageCapture>>({});

  const themeColor = anime?.color || theme.accent;
  const themeColorFg = readableTextOn(themeColor);
  const styles = useMemo(() => makeStyles(theme, insets.top), [theme, insets.top]);

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
        try {
          const detailed: AnitabiPointDetail[] = await anitabiService.getDetailedPoints(validBangumiId);
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

  const handleBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.back();
  }, [router]);

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
      message: `${anime.title || anime.cn || 'Pilgrimage'} · ${stats.spotCount} spots${url ? `\n${url}` : ''}`,
    }).catch(() => undefined);
  }, [anime, browseSource, stats.spotCount]);

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
      router.push({
        pathname: '/pilgrimage/compare/tips',
        params: {
          spotId: spot.id,
          imageUrl: spot.image,
          name: spot.cn || spot.name,
          ep: String(spot.ep),
          animeId: bangumiId !== null ? String(bangumiId) : '',
          themeColor,
          ...(lat ? { spotLat: lat } : {}),
          ...(lng ? { spotLng: lng } : {}),
        },
      });
    },
    [router, bangumiId, themeColor]
  );

  const isEmpty = !loading && !error && (!anime || points.length === 0);
  const heroAccentRgb = themeColor;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <LinearGradient
          colors={theme.gradient}
          style={StyleSheet.absoluteFill}
        />

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
            <View
              style={[
                styles.headerBackdropBorder,
                { backgroundColor: theme.glassBorder },
              ]}
            />
          </Animated.View>

          <Animated.View style={[styles.headerStickyTitle, stickyTitleStyle]} pointerEvents="none">
            <ThemedText variant="titleMedium" weight="700" numberOfLines={1}>
              {anime?.title ?? 'Pilgrimage'}
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
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.accent} />
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
              <ThemedText variant="bodyMedium" weight="700" style={{ color: readableTextOn(theme.accent) }}>
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
                  <View style={[styles.heroSpotBadge, { borderColor: `${themeColor}66`, backgroundColor: `${themeColor}1A` }]}>
                    <Ionicons name="location" size={11} color={themeColor} />
                    <ThemedText variant="captionSmall" weight="700" style={{ color: themeColor }}>
                      {stats.spotCount} {stats.spotCount === 1 ? 'pilgrimage spot' : 'pilgrimage spots'}
                    </ThemedText>
                  </View>
                ) : null}
                <ThemedText variant="headlineLarge" weight="800" numberOfLines={2}>
                  {anime?.title ?? ''}
                </ThemedText>
                {anime?.cn ? (
                  <ThemedText variant="bodyMedium" tone="secondary" numberOfLines={1}>
                    {anime.cn}
                    {anime.city ? ` · ${anime.city}` : ''}
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
                      { borderColor: `${themeColor}99`, backgroundColor: `${theme.background.primary}80` },
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
                  label={stats.spotCount === 1 ? 'spot' : 'spots'}
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
                    count={filteredPoints.length}
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
                    badge={points.length}
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
                    badge={points.length - stats.visitedCount}
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
                    badge={stats.visitedCount}
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
                    badge={stats.capturedCount}
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

                <View style={styles.sectionHeader}>
                  <ThemedText variant="titleLarge" weight="700">
                    {viewMode === 'list' ? 'Scene list' : 'Map view'}
                  </ThemedText>
                  <ThemedText variant="bodySmall" tone="tertiary">
                    {viewMode === 'list'
                      ? `${filteredPoints.length} ${filteredPoints.length === 1 ? 'scene' : 'scenes'} · ${stats.visitedCount} visited`
                      : 'Tap a marker to view the scene'}
                  </ThemedText>
                </View>
              </>
            ) : null}

            {isEmpty ? (
              <View style={styles.emptyCard}>
                <MaterialIcons name="explore-off" size={36} color={theme.text.tertiary} />
                <ThemedText variant="titleMedium" weight="700" align="center">
                  No pilgrimage data yet for this anime
                </ThemedText>
                <ThemedText variant="bodySmall" tone="secondary" align="center">
                  Anitabi crowd-sources scene locations. Help fill the map by contributing on anitabi.cn.
                </ThemedText>
                <Pressable
                  onPress={() => Linking.openURL('https://anitabi.cn').catch(() => undefined)}
                  style={({ pressed }) => [styles.emptyBtn, { backgroundColor: theme.accent }, pressed && { opacity: 0.85 }]}>
                  <Ionicons name="open-outline" size={14} color={readableTextOn(theme.accent)} />
                  <ThemedText variant="bodySmall" weight="700" style={{ color: readableTextOn(theme.accent) }}>
                    Open Anitabi
                  </ThemedText>
                </Pressable>
              </View>
            ) : viewMode === 'list' ? (
              <View style={styles.list}>
                {filteredPoints.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <ThemedText variant="bodyMedium" tone="secondary" align="center">
                      No scenes match this filter.
                    </ThemedText>
                  </View>
                ) : (
                  filteredPoints.map((spot) => (
                    <SpotRow
                      key={spot.id}
                      spot={spot}
                      themeColor={themeColor}
                      themeColorFg={themeColorFg}
                      distanceKm={distanceFor(spot)}
                      visited={visited[spot.id] === true}
                      hasCapture={!!captures[spot.id]}
                      theme={theme}
                      onPress={(s) => {
                        Haptics.selectionAsync().catch(() => undefined);
                        setActiveSpot(s);
                      }}
                      onToggleVisited={handleToggleVisited}
                      onOpenMaps={handleOpenMaps}
                    />
                  ))
                )}
              </View>
            ) : (
              <View style={[styles.mapWrap, { borderColor: theme.glassBorder, backgroundColor: theme.background.secondary }]}>
                <SpotMapView
                  spots={filteredPoints}
                  visited={visited}
                  ringColor={themeColor}
                  userLocation={userLocation}
                  centerGeo={anime?.geo ?? null}
                  centerZoom={anime?.zoom ?? 12}
                  theme={theme}
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

function FilterPill({ label, active, badge, themeColor, themeColorFg, theme, icon, onPress }: FilterPillProps) {
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
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}>
              {spots.map((spot) => {
                const isVisited = visited[spot.id] === true;
                const km = distanceFor(spot);
                return (
                  <Pressable
                    key={spot.id}
                    onPress={() => onPick(spot)}
                    style={({ pressed }) => [
                      styles.row,
                      isVisited && { borderColor: `${theme.status.success}66` },
                      pressed && { opacity: 0.78 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${spot.name}`}>
                    <View style={[styles.thumbWrap, { borderColor: themeColor }]}>
                      <Image
                        source={{ uri: spot.image }}
                        style={styles.thumb}
                        contentFit="cover"
                        transition={120}
                      />
                      <View style={[styles.epPill, { backgroundColor: `${themeColor}E6` }]}>
                        <ThemedText variant="captionSmall" weight="800" style={{ color: themeColorFg }}>
                          EP {spot.ep}
                        </ThemedText>
                      </View>
                    </View>
                    <View style={styles.rowBody}>
                      <ThemedText variant="bodyMedium" weight="700" numberOfLines={2}>
                        {spot.name}
                      </ThemedText>
                      {spot.cn ? (
                        <ThemedText variant="bodySmall" tone="secondary" numberOfLines={1} style={{ marginTop: 1 }}>
                          {spot.cn}
                        </ThemedText>
                      ) : null}
                      {km != null ? (
                        <ThemedText variant="captionSmall" tone="tertiary" weight="500" style={{ marginTop: 3 }}>
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

function ViewModeTab({ active, label, icon, themeColor, themeColorFg, count, theme, onPress }: ViewModeTabProps) {
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
          : { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder, borderWidth: 1 },
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
      color: '#FFFFFF',
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
