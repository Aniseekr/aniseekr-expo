// Interactive map view for the pilgrimage feature.
//
// Stack:
//   Leaflet (bundled locally — see scripts/bundle-leaflet.mjs) inside a WebView,
//   served from the stable origin `MAP_BASE_URL` so the Cache API persists
//   tiles between launches. OpenStreetMap raster tiles are cached on first
//   paint and re-served instantly on revisit, including offline.
//
// Native ↔ WebView protocol:
//   WebView → native:  { type: 'ready' } | { type: 'markerPress', id }
//   native → WebView:  injectJavaScript(`window.__updateMarkers([...])`) — keeps
//                      pan/zoom/cache when filters change instead of reloading.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import {
  LEAFLET_CSS,
  LEAFLET_JS,
  LEAFLET_MARKERCLUSTER_CSS,
  LEAFLET_MARKERCLUSTER_JS,
} from '../../libs/services/pilgrimage/leaflet-assets';
import {
  JAPAN_CENTER,
  MAP_BASE_BODY,
  MAP_BASE_CSS,
  MAP_BASE_JS,
  MAP_BASE_URL,
  TILE_URL,
} from '../../libs/services/pilgrimage/leaflet-map';
import type { AnitabiBangumi } from '../../libs/services/pilgrimage/types';

export interface PilgrimageMapAnime {
  anime: AnitabiBangumi;
  distanceKm?: number;
  /** True when this anime is in the user's collection — marker shows a check overlay. */
  inCollection?: boolean;
}

export interface PilgrimageMapViewProps {
  animeList: readonly PilgrimageMapAnime[];
  userLocation?: { latitude: number; longitude: number } | null;
  onMarkerPress?: (anime: AnitabiBangumi) => void;
  style?: StyleProp<ViewStyle>;
}

const USER_ZOOM = 11;

const isValidGeo = (geo: readonly [number, number] | null | undefined): geo is [number, number] => {
  if (!geo || geo.length < 2) return false;
  const [lat, lng] = geo;
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
};

interface MarkerPayload {
  id: string;
  lat: number;
  lng: number;
  title: string;
  cover: string | null;
  ringColor: string;
  pointsLength: number;
  city: string | null;
  inCollection: boolean;
}

function buildMarkers(list: readonly PilgrimageMapAnime[], idIndex: Map<string, AnitabiBangumi>) {
  const markers: MarkerPayload[] = [];
  idIndex.clear();
  for (const { anime, inCollection } of list) {
    if (!isValidGeo(anime.geo)) continue;
    const [lat, lng] = anime.geo;
    const idStr = String(anime.id);
    idIndex.set(idStr, anime);
    markers.push({
      id: idStr,
      lat,
      lng,
      title: anime.title || anime.cn || '',
      cover: (anime.cover ?? '').replace('?plan=h160', '?plan=h120') || null,
      ringColor: anime.color || Colors.primary,
      pointsLength: anime.pointsLength,
      city: anime.city || null,
      inCollection: !!inCollection,
    });
  }
  return markers;
}

/**
 * Builds the static map shell. Markers are not embedded — they are pushed in
 * via `__updateMarkers` after the page reports `ready`, so filter changes
 * don't blow away the tile cache or the user's current pan/zoom.
 */
function buildHtml(initial: {
  center: { lat: number; lng: number; zoom: number };
  user: { lat: number; lng: number } | null;
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
  .ani-marker {
    width: 44px; height: 44px; border-radius: 12px;
    border: 2px solid var(--ring, #FF9F0A);
    background: #1c1c1e;
    overflow: hidden; position: relative;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 10px rgba(0,0,0,0.35);
  }
  .ani-marker img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ani-marker .pin { color: #fff; font-size: 18px; }
  .ani-marker .check {
    position: absolute; right: -4px; bottom: -4px;
    width: 18px; height: 18px; border-radius: 9px;
    background: #30D158; color: #000;
    font: 700 12px -apple-system, system-ui, sans-serif;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid #1c1c1e;
    box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  }
  .ani-marker.in-collection { border-width: 3px; }
  .leaflet-popup-content-wrapper {
    background: #1c1c1e; color: #fff;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 12px;
  }
  .leaflet-popup-tip { background: #1c1c1e; border: 1px solid rgba(255,255,255,0.12); }
  .leaflet-popup-content { margin: 10px 12px; min-width: 180px; }
  .pop-title { font: 600 14px -apple-system, system-ui, sans-serif; color: #fff; margin: 0 0 2px; }
  .pop-meta { font: 500 11px -apple-system, system-ui, sans-serif; color: rgba(235,235,245,0.6); margin: 0 0 8px; }
  .pop-btn {
    display: block; width: 100%; padding: 7px 10px; border: 0;
    border-radius: 8px; color: #000; font: 600 13px -apple-system, system-ui, sans-serif;
    text-align: center; cursor: pointer;
  }
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

  var initialZoom = initial.center.zoom;
  var initialCenter = L.latLng(initial.center.lat, initial.center.lng);
  window.__bindMap(map, function recenter() {
    if (initial.user) map.flyTo([initial.user.lat, initial.user.lng], ${USER_ZOOM}, { duration: 0.4 });
    else map.flyTo(initialCenter, initialZoom, { duration: 0.4 });
  });

  // Cluster group: aggregates overlapping anime pins. Disables once the user
  // zooms close enough that individual markers are clearly distinguishable.
  var markerLayer = window.__makeClusterGroup({ ringColor: '#FF9F0A', disableAt: 10 });
  markerLayer.addTo(map);
  var lastMarkerCount = 0;

  window.__updateMarkers = function(markers) {
    markerLayer.clearLayers();
    var batch = [];
    var bounds = [];
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      var ring = m.inCollection ? '#30D158' : m.ringColor;
      var cls = 'ani-marker' + (m.inCollection ? ' in-collection' : '');
      var html = '<div class="' + cls + '" style="--ring:' + ring + '">' +
        (m.cover ? '<img src="' + m.cover + '" loading="lazy" />' : '<span class="pin">📍</span>') +
        (m.inCollection ? '<span class="check">✓</span>' : '') +
      '</div>';
      var icon = L.divIcon({ className: '', html: html, iconSize: [44,44], iconAnchor: [22,22] });
      var marker = L.marker([m.lat, m.lng], { icon: icon });
      marker.__appId = m.id;
      var meta = m.pointsLength + ' spot' + (m.pointsLength === 1 ? '' : 's') +
        (m.city ? ' · ' + m.city : '') +
        (m.inCollection ? ' · ✓ in collection' : '');
      var popup = '<div>' +
        '<div class="pop-title">' + (m.title || 'Untitled') + '</div>' +
        '<div class="pop-meta">' + meta + '</div>' +
        '<button class="pop-btn" style="background:' + ring + '" onclick="window.__open(\\'' + m.id + '\\')">Open</button>' +
      '</div>';
      marker.bindPopup(popup, { closeButton: false, offset: [0, -18] });
      batch.push(marker);
      bounds.push([m.lat, m.lng]);
    }
    if (typeof markerLayer.addLayers === 'function') markerLayer.addLayers(batch);
    else for (var j = 0; j < batch.length; j++) markerLayer.addLayer(batch[j]);

    // Only fit bounds when going from empty → populated, otherwise the user's
    // pan/zoom would jump every filter tick.
    if (bounds.length > 1 && lastMarkerCount === 0 && !initial.user) {
      try { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 8, animate: false }); } catch (e) {}
    }
    lastMarkerCount = markers.length;
  };

  window.__open = function(id) { window.__post({ type: 'markerPress', id: id }); };

  window.__post({ type: 'ready' });
})();
</script>
</body>
</html>`;
}

export function PilgrimageMapView({
  animeList,
  userLocation,
  onMarkerPress,
  style,
}: PilgrimageMapViewProps) {
  const webviewRef = useRef<WebView>(null);
  const animeById = useRef(new Map<string, AnitabiBangumi>());
  const [ready, setReady] = useState(false);
  const [clusterItems, setClusterItems] = useState<AnitabiBangumi[] | null>(null);

  // Stable HTML — only depends on the *initial* user location so the map shell
  // doesn't reload when the user pans or filters change. Subsequent updates
  // (markers, recentered location) flow via injectJavaScript.
  const html = useMemo(() => {
    const center = userLocation
      ? { lat: userLocation.latitude, lng: userLocation.longitude, zoom: USER_ZOOM }
      : JAPAN_CENTER;
    const user = userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : null;
    return buildHtml({ center, user });
    // userLocation intentionally only consumed once; live location updates
    // would re-warm the tile cache on every fix, which is wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markers = useMemo(() => buildMarkers(animeList, animeById.current), [animeList]);

  useEffect(() => {
    if (!ready || !webviewRef.current) return;
    const json = JSON.stringify(markers).replace(/</g, '\\u003c');
    webviewRef.current.injectJavaScript(`
      try { window.__updateMarkers && window.__updateMarkers(${json}); } catch(e) {}
      true;
    `);
  }, [markers, ready]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
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
        if (data.type === 'markerPress' && data.id) {
          const anime = animeById.current.get(data.id);
          if (anime) onMarkerPress?.(anime);
          return;
        }
        if (data.type === 'clusterPress' && Array.isArray(data.ids)) {
          const items: AnitabiBangumi[] = [];
          for (const raw of data.ids) {
            const a = animeById.current.get(String(raw));
            if (a) items.push(a);
          }
          if (items.length > 0) {
            Haptics.selectionAsync().catch(() => undefined);
            setClusterItems(items);
          }
        }
      } catch {
        // ignore malformed messages
      }
    },
    [onMarkerPress]
  );

  const handleClusterPick = useCallback(
    (anime: AnitabiBangumi) => {
      Haptics.selectionAsync().catch(() => undefined);
      setClusterItems(null);
      onMarkerPress?.(anime);
    },
    [onMarkerPress]
  );

  return (
    <View style={[styles.container, style]} testID="pilgrimage-map">
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
            <Ionicons name="map-outline" size={32} color={Colors.text.secondary} />
            <Text style={styles.fallbackTitle}>Map unavailable</Text>
            <Text style={styles.fallbackBody}>
              Couldn&apos;t load the map. Check your connection and try again.
            </Text>
          </View>
        )}
        startInLoadingState
      />
      <ClusterPickerSheet
        items={clusterItems}
        onClose={() => setClusterItems(null)}
        onPick={handleClusterPick}
      />
    </View>
  );
}

interface ClusterPickerSheetProps {
  items: AnitabiBangumi[] | null;
  onClose: () => void;
  onPick: (anime: AnitabiBangumi) => void;
}

function ClusterPickerSheet({ items, onClose, onPick }: ClusterPickerSheetProps) {
  if (!items || items.length === 0) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={pickerStyles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={pickerStyles.sheet}>
          <SafeAreaView edges={['bottom']}>
            <View style={pickerStyles.handle} />
            <View style={pickerStyles.headerRow}>
              <Text style={pickerStyles.headerTitle}>{items.length} anime here</Text>
              <Pressable onPress={onClose} hitSlop={12} style={pickerStyles.closeBtn}>
                <Ionicons name="close" size={20} color={Colors.text.secondary} />
              </Pressable>
            </View>
            <ScrollView
              style={pickerStyles.list}
              contentContainerStyle={pickerStyles.listContent}
              showsVerticalScrollIndicator={false}>
              {items.map((anime) => (
                <ClusterPickerRow key={anime.id} anime={anime} onPress={() => onPick(anime)} />
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

interface ClusterPickerRowProps {
  anime: AnitabiBangumi;
  onPress: () => void;
}

function ClusterPickerRow({ anime, onPress }: ClusterPickerRowProps) {
  const ring = anime.color || Colors.primary;
  const cover = (anime.cover ?? '').replace('?plan=h160', '?plan=h120');
  const meta = `${anime.pointsLength} spot${anime.pointsLength === 1 ? '' : 's'}${anime.city ? ` · ${anime.city}` : ''}`;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pickerStyles.row, pressed && { opacity: 0.78 }]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${anime.title}`}>
      <View style={[pickerStyles.thumbWrap, { borderColor: ring }]}>
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={pickerStyles.thumb}
            contentFit="cover"
            transition={120}
          />
        ) : (
          <View style={[pickerStyles.thumb, { backgroundColor: Colors.background.tertiary }]} />
        )}
      </View>
      <View style={pickerStyles.rowBody}>
        <Text style={pickerStyles.rowTitle} numberOfLines={1}>
          {anime.title || anime.cn || 'Untitled'}
        </Text>
        {anime.cn && anime.cn !== anime.title ? (
          <Text style={pickerStyles.rowSubtitle} numberOfLines={1}>
            {anime.cn}
          </Text>
        ) : null}
        <Text style={pickerStyles.rowMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.text.tertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
    borderRadius: Radius.lg,
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

const pickerStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background.secondary,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
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
    width: 56,
    height: 56,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    backgroundColor: Colors.background.tertiary,
  },
  thumb: {
    width: '100%',
    height: '100%',
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
