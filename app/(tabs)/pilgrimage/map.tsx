// Dedicated full-bleed map route. Lives outside the Tabs UI (registered with
// tabBarStyle: display 'none' in app/_layout.tsx) so the bottom dock and the
// hub's top bar both disappear — that's what users mean by "全螢幕".
//
// Pushed from the hub, so back goes back to the hub instead of falling out
// to the previously-selected tab.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { ThemedText } from '../../../components/themed';
import { pilgrimageRepository } from '../../../libs/services/pilgrimage/pilgrimage-repository';
import { FEATURED_PILGRIMAGE_ANIME } from '../../../libs/services/pilgrimage/featured-anime';
import { collectionPilgrimageService } from '../../../libs/services/pilgrimage/collection-pilgrimage-service';
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
  TILE_ATTRIBUTION,
  TILE_MAX_ZOOM,
  TILE_SUBDOMAINS,
  TILE_URL,
  TOKYO_STATION,
} from '../../../libs/services/pilgrimage/leaflet-map';
import { getNumberParam } from '../../../libs/utils/route-params';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';

interface HubMapMarker {
  bangumiId: number;
  lat: number;
  lng: number;
  cover: string;
  title: string;
  city: string;
  pointsLength: number;
  ringColor: string;
}

function isValidGeo(geo: readonly [number, number] | null | undefined): boolean {
  if (!geo || geo.length < 2) return false;
  const [lat, lng] = geo;
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

function buildHubMapHtml(initial: {
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
  .anime-marker {
    width: 44px; height: 44px; border-radius: 12px;
    border: 2px solid var(--ring, #FF9F0A);
    background: #1c1c1e; overflow: hidden; position: relative;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 6px 14px rgba(0,0,0,0.45);
    transition: transform .15s ease;
  }
  .anime-marker:active { transform: scale(0.92); }
  .anime-marker img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .anime-marker .pts {
    position: absolute; bottom: -6px; right: -8px;
    background: #1c1c1e; color: #fff;
    border: 2px solid var(--ring, #FF9F0A);
    border-radius: 8px; padding: 1px 5px;
    font: 700 9px -apple-system, system-ui, sans-serif;
    line-height: 1.2;
  }
</style>
</head>
<body>
${MAP_BASE_BODY}
<script>${LEAFLET_JS}</script>
<script>${LEAFLET_MARKERCLUSTER_JS}</script>
<script>${MAP_BASE_JS}</script>
<script>
(function(){
  var initial = ${initialJson};
  var map = L.map('map', { zoomControl: false, attributionControl: true, fadeAnimation: true })
    .setView([initial.center.lat, initial.center.lng], initial.center.zoom);
  new window.CachedTileLayer(${JSON.stringify(TILE_URL)}, {
    maxZoom: ${TILE_MAX_ZOOM}, minZoom: 3,
    subdomains: ${JSON.stringify(TILE_SUBDOMAINS)},
    attribution: ${JSON.stringify(TILE_ATTRIBUTION)},
    keepBuffer: 4, updateWhenIdle: false
  }).addTo(map);

  // See index.tsx for the rationale behind the post-mount user pin update.
  var userMarker = null;
  var didSnapToUser = false;
  function applyUser(user) {
    if (userMarker) { try { map.removeLayer(userMarker); } catch (e) {} userMarker = null; }
    if (user && typeof user.lat === 'number' && typeof user.lng === 'number') {
      var userIcon = L.divIcon({ className: '', html: '<div class="user-pulse"></div>', iconSize: [16,16], iconAnchor: [8,8] });
      userMarker = L.marker([user.lat, user.lng], { icon: userIcon, interactive: false, keyboard: false }).addTo(map);
      // First time we get a real location fix, snap the camera to a tight
      // ~10 km-wide framing around the user. Permission usually resolves
      // after the WebView is up, so we can't just rely on the initial
      // setView. We don't repeat this on subsequent updates — the user is
      // already framed; rough GPS noise shouldn't yank the map around.
      if (!didSnapToUser) {
        didSnapToUser = true;
        try { map.flyTo([user.lat, user.lng], 13, { duration: 0.4 }); } catch (e) {}
      }
    }
    initial.user = user;
  }
  applyUser(initial.user);
  window.__updateUser = applyUser;

  var initialCenter = L.latLng(initial.center.lat, initial.center.lng);
  var initialZoom = initial.center.zoom;
  var lastBounds = null;
  window.__bindMap(map, function recenter() {
    if (initial.user) {
      var did = window.__fitNearby(map, initial.user, null, {
        zoom: 14,
        home: { lat: initial.center.lat, lng: initial.center.lng, zoom: initial.center.zoom },
      });
      if (did) return;
    }
    if (lastBounds) {
      try { map.flyToBounds(lastBounds, { padding: [40, 40], maxZoom: 11, duration: 0.4 }); return; } catch (e) {}
    }
    map.flyTo(initialCenter, initialZoom, { duration: 0.4 });
  });

  var clusterLayer = window.__makeClusterGroup({ ringColor: initial.ringColor, disableAt: 12 });
  clusterLayer.addTo(map);
  var didFit = false;

  window.__updateMarkers = function(markers) {
    clusterLayer.clearLayers();
    var bounds = [];
    var batch = [];
    for (var i = 0; i < markers.length; i++) {
      (function(m){
        var html = '<div class="anime-marker" style="--ring:' + m.ringColor + '">' +
          (m.cover ? '<img src="' + m.cover + '" loading="lazy" />' : '') +
          '<span class="pts">' + m.pointsLength + '</span>' +
        '</div>';
        var icon = L.divIcon({ className: '', html: html, iconSize: [44,44], iconAnchor: [22,22] });
        var marker = L.marker([m.lat, m.lng], { icon: icon, regionColor: m.ringColor });
        marker.__appId = m.bangumiId;
        marker.on('click', function() { window.__post({ type: 'animePress', id: m.bangumiId }); });
        batch.push(marker);
        bounds.push([m.lat, m.lng]);
      })(markers[i]);
    }
    if (typeof clusterLayer.addLayers === 'function') clusterLayer.addLayers(batch);
    else for (var k = 0; k < batch.length; k++) clusterLayer.addLayer(batch[k]);

    if (bounds.length > 0) {
      try { lastBounds = L.latLngBounds(bounds); } catch (e) { lastBounds = null; }
    }
    // Do NOT auto fit-to-all-markers. Pilgrimage points span the whole
    // archipelago — fitting them all dropped the camera to ~zoom 6 (a
    // country map), which made the screen feel like an atlas instead of
    // "what's around me". We keep the initial setView (user → zoom 13 via
    // applyUser, otherwise Tokyo Station) and let the user pan / hit the
    // recenter button (which uses lastBounds) when they actually want the
    // wider view.
    didFit = true;
  };

  window.__focusAnime = function(target) {
    if (!target || typeof target.lat !== 'number') return;
    try { map.flyTo([target.lat, target.lng], 11, { duration: 0.6 }); } catch (e) {}
  };

  window.__post({ type: 'ready' });
})();
</script>
</body>
</html>`;
}

const COLLECTION_BACKFILL_TARGET = 16;

export default function PilgrimageMapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const focusBangumiId = getNumberParam(params, 'focus');
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [animes, setAnimes] = useState<AnitabiBangumi[]>([]);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [loading, setLoading] = useState(true);

  // Same priority as the hub: collection first, featured backfills.
  // anitabiService memoises every fetch, so re-loading here costs ~nothing
  // when the user just came from the hub.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      const merged = new Map<number, AnitabiBangumi>();
      try {
        const entries = await collectionPilgrimageService.getEntries();
        for (const e of entries) {
          if (e.anime && !merged.has(e.anime.id)) merged.set(e.anime.id, e.anime);
        }
      } catch (err) {
        console.warn('[PilgrimageMap] collection load failed:', err);
      }

      if (merged.size < COLLECTION_BACKFILL_TARGET) {
        const results = await Promise.allSettled(
          FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) =>
            pilgrimageRepository.getSpotsByBangumiId(bangumiId)
          )
        );
        for (const r of results) {
          if (r.status !== 'fulfilled' || !r.value) continue;
          if (!merged.has(r.value.id)) merged.set(r.value.id, r.value);
        }
      }

      if (cancelled) return;
      const list = [...merged.values()].sort(
        (a, b) => (b.pointsLength ?? 0) - (a.pointsLength ?? 0)
      );
      setAnimes(list);
      setLoading(false);
    })();

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

  const markers = useMemo<HubMapMarker[]>(() => {
    const out: HubMapMarker[] = [];
    for (const anime of animes) {
      if (!isValidGeo(anime.geo)) continue;
      out.push({
        bangumiId: anime.id,
        lat: anime.geo[0],
        lng: anime.geo[1],
        cover: anime.cover ?? '',
        title: anime.cn || anime.title,
        city: anime.city ?? '',
        pointsLength: anime.pointsLength ?? 0,
        ringColor: anime.color || theme.accent,
      });
    }
    return out;
  }, [animes, theme.accent]);

  const handleAnimePress = useCallback(
    (bangumiId: number) => {
      Haptics.selectionAsync().catch(() => undefined);
      router.push(`/pilgrimage/${bangumiId}`);
    },
    [router]
  );

  const handleBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.back();
  }, [router]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : markers.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="map-outline" size={32} color={theme.text.tertiary} />
          <ThemedText variant="bodyMedium" tone="secondary" align="center">
            No anime with mapped pilgrimage locations yet.
          </ThemedText>
        </View>
      ) : (
        <FullscreenMapView
          markers={markers}
          userLocation={userLocation}
          ringColor={theme.accent}
          theme={theme}
          focusBangumiId={focusBangumiId}
          onAnimePress={handleAnimePress}
        />
      )}

      <Pressable
        onPress={handleBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        style={({ pressed }) => [
          styles.backFab,
          { top: insets.top + 12, backgroundColor: `${theme.background.primary}E0` },
          pressed && { opacity: 0.8 },
        ]}>
        <Ionicons name="chevron-back" size={20} color={theme.text.primary} />
      </Pressable>
    </View>
  );
}

interface FullscreenMapViewProps {
  markers: readonly HubMapMarker[];
  userLocation: LatLng | null;
  ringColor: string;
  theme: ThemePalette;
  focusBangumiId: number | null;
  onAnimePress: (bangumiId: number) => void;
}

function FullscreenMapView({
  markers,
  userLocation,
  ringColor,
  theme,
  focusBangumiId,
  onAnimePress,
}: FullscreenMapViewProps) {
  const webviewRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);

  const html = useMemo(() => {
    // Default to Tokyo Station so users who haven't granted location (or are
    // outside Japan) still land in the densest pilgrimage region. The user
    // pin still renders if granted, and applyUser() snaps to it on the first
    // location fix.
    //
    // Zoom 12 (≈15 km wide) gives a "central Tokyo" framing instead of
    // TOKYO_STATION.zoom (11, ≈30 km wide) which felt like an overview.
    const center = { lat: TOKYO_STATION.lat, lng: TOKYO_STATION.lng, zoom: 12 };
    const user = userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : null;
    return buildHubMapHtml({ center, user, ringColor });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !webviewRef.current) return;
    const json = JSON.stringify(markers).replace(/</g, '\\u003c');
    webviewRef.current.injectJavaScript(`
      try { window.__updateMarkers && window.__updateMarkers(${json}); } catch(e) {}
      true;
    `);
  }, [markers, ready]);

  // Push user-location updates so the locate-me bounds-fit works for users
  // who only grant permission after mount.
  useEffect(() => {
    if (!ready || !webviewRef.current) return;
    const payload = userLocation
      ? JSON.stringify({ lat: userLocation.latitude, lng: userLocation.longitude })
      : 'null';
    webviewRef.current.injectJavaScript(`
      try { window.__updateUser && window.__updateUser(${payload}); } catch(e) {}
      true;
    `);
  }, [userLocation, ready]);

  useEffect(() => {
    if (!ready || !webviewRef.current || focusBangumiId === null) return;
    const target = markers.find((m) => m.bangumiId === focusBangumiId);
    if (!target) return;
    const payload = JSON.stringify({ lat: target.lat, lng: target.lng });
    webviewRef.current.injectJavaScript(`
      try { window.__focusAnime && window.__focusAnime(${payload}); } catch(e) {}
      true;
    `);
  }, [focusBangumiId, ready, markers]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as { type: string; id?: number };
      if (data.type === 'ready') {
        setReady(true);
        return;
      }
      if (data.type === 'animePress' && typeof data.id === 'number') {
        onAnimePress(data.id);
      }
    } catch {
      // ignore
    }
  };

  return (
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
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.background.primary }]}
      renderError={() => (
        <View style={[StyleSheet.absoluteFill, styles.loadingBox]}>
          <Ionicons name="map-outline" size={32} color={theme.text.secondary} />
          <ThemedText variant="bodyMedium" tone="secondary" align="center">
            Couldn&apos;t load the map.
          </ThemedText>
        </View>
      )}
      startInLoadingState
    />
  );
}

// Module-scoped styles for the fallback inside FullscreenMapView so the
// component doesn't recompute them on every render.
const styles = StyleSheet.create({
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 20,
  },
});

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background.primary },
    loadingBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 20,
    },
    emptyBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      padding: 32,
    },
    backFab: {
      position: 'absolute',
      left: 16,
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.glassBorder,
      shadowColor: '#000',
      shadowOpacity: 0.4,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
  });
}
