// Pilgrimage hub. Matches japanwalker.pen Screen 1 (q3N3pG):
// Header (聖地巡禮 + map/list segmented + search) → Plan your day intro →
// Nearby hero (170h with grid + scatter pins) → Popular Animes rail (128x200)
// → Featured Spots list (72 photo + info + 56 mini map).
//
// Data priority (matches "collection 優先, 不夠再補 featured" requirement):
//   1. The user's collection (user_anime + favorites) joined to Anitabi via
//      collectionPilgrimageService — these are the anime the user actually
//      cares about and should anchor every rail/list.
//   2. FEATURED_PILGRIMAGE_ANIME backfills until the rails feel populated.
//
// Featured Spots are picked by city cluster: each city contributes one
// representative spot (image preferred, geo required), then we shuffle so
// the list rotates between launches instead of always anchoring on Tokyo.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { pilgrimageRepository } from '../../../libs/services/pilgrimage/pilgrimage-repository';
import { FEATURED_PILGRIMAGE_ANIME } from '../../../libs/services/pilgrimage/featured-anime';
import { collectionPilgrimageService } from '../../../libs/services/pilgrimage/collection-pilgrimage-service';
import { locationService, type LatLng } from '../../../libs/services/pilgrimage/location-service';
import { loadVisitedSpots, type VisitedMap } from '../../../libs/services/pilgrimage/visited-prefs';
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
import { ThemedText, readableTextOn } from '../../../components/themed';
import type { AnitabiBangumi, AnitabiPoint } from '../../../libs/services/pilgrimage/types';

interface FeaturedSpot {
  spot: AnitabiPoint;
  anime: AnitabiBangumi;
  distanceKm?: number;
  fromCollection: boolean;
}

interface AnimeCard {
  anime: AnitabiBangumi;
  fromCollection: boolean;
  distanceKm?: number;
}

// Tiered radii — most users are not standing in Japan, so a hard 50km cap
// makes the "nearby" hero permanently empty. We fan out and label each tier
// honestly instead of pretending everything is "near".
const NEARBY_TIERS_KM: readonly { km: number; label: string }[] = [
  { km: 30, label: 'walking · 30 km' },
  { km: 100, label: 'day trip · 100 km' },
  { km: 500, label: 'in region · 500 km' },
  { km: 5000, label: 'in Japan' },
];
const FEATURED_SPOT_LIMIT = 6;
const POPULAR_LIMIT = 14;
const COLLECTION_BACKFILL_TARGET = 16;

function isValidGeo(
  geo: readonly [number, number] | null | undefined
): geo is readonly [number, number] {
  if (!geo || geo.length < 2) return false;
  const [lat, lng] = geo;
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

// Mulberry32 — tiny seeded PRNG. Used so the "random" rotation across cities
// is stable for a given (date, pool size) pair, which keeps the list calm
// during a single session and not jittery on every re-render.
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pickCityRepresentatives(pool: FeaturedSpot[], limit: number, seed: number): FeaturedSpot[] {
  if (pool.length === 0) return [];
  const buckets = new Map<string, FeaturedSpot[]>();
  for (const item of pool) {
    const city = item.anime.city || item.anime.cn || item.anime.title || 'unknown';
    const arr = buckets.get(city);
    if (arr) arr.push(item);
    else buckets.set(city, [item]);
  }
  const rand = mulberry32(seed);
  const cityOrder = [...buckets.keys()].sort(() => rand() - 0.5);
  const picked: FeaturedSpot[] = [];
  // First pass: one representative per city.
  for (const city of cityOrder) {
    const bucket = buckets.get(city);
    if (!bucket || bucket.length === 0) continue;
    const idx = Math.floor(rand() * bucket.length);
    const chosen = bucket.splice(idx, 1)[0];
    if (chosen) picked.push(chosen);
    if (picked.length >= limit) return picked;
  }
  // Second pass: fill remaining slots from any leftover spots so we don't
  // under-fill when there are fewer cities than the limit.
  const leftovers: FeaturedSpot[] = [];
  for (const bucket of buckets.values()) leftovers.push(...bucket);
  leftovers.sort(() => rand() - 0.5);
  for (const item of leftovers) {
    if (picked.length >= limit) break;
    picked.push(item);
  }
  return picked;
}

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

function buildHubMapHtml(initial: {
  center: { lat: number; lng: number; zoom: number };
  user: { lat: number; lng: number } | null;
  ringColor: string;
  /** Distance from the WebView bottom to lift map controls. */
  controlsBottom: number;
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
  :root {
    --mc-bottom: ${initial.controlsBottom}px;
    --attr-bottom: ${Math.max(0, initial.controlsBottom - 32)}px;
  }
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

  // User location can arrive after the WebView is constructed (the native side
  // resolves it async). Centralise pin management so the React side can push
  // updates via window.__updateUser without us re-mounting the page (which
  // would blow away the tile cache).
  var userMarker = null;
  function applyUser(user) {
    if (userMarker) { try { map.removeLayer(userMarker); } catch (e) {} userMarker = null; }
    if (user && typeof user.lat === 'number' && typeof user.lng === 'number') {
      var userIcon = L.divIcon({ className: '', html: '<div class="user-pulse"></div>', iconSize: [16,16], iconAnchor: [8,8] });
      userMarker = L.marker([user.lat, user.lng], { icon: userIcon, interactive: false, keyboard: false }).addTo(map);
    }
    // Mutate initial.user so the recentre closure sees the freshest value.
    initial.user = user;
  }
  applyUser(initial.user);
  window.__updateUser = applyUser;

  var initialCenter = L.latLng(initial.center.lat, initial.center.lng);
  var initialZoom = initial.center.zoom;
  var lastBounds = null;
  // Tapping the recentre button: if we have a user fix, zoom tight to it
  // (~2 km on screen) so the user sees a walkable patch around their pin,
  // not the whole country. Anime markers inside that patch render naturally.
  // No user fix → fall back to flying home (Tokyo Station).
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
    if (!didFit && bounds.length > 1) {
      try { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 9, animate: false }); didFit = true; } catch (e) {}
    } else if (!didFit && bounds.length === 1) {
      try { map.setView(bounds[0], 11, { animate: false }); didFit = true; } catch (e) {}
    }
  };

  // Native side calls this when the user taps the Nearby hero — we slide
  // the map to that anime's center so they get spatial context, but we do
  // NOT auto-open the detail page (that surprised users; they expected the
  // tap to open the map, not jump screens).
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

interface HubMapViewProps {
  markers: readonly HubMapMarker[];
  userLocation: LatLng | null;
  ringColor: string;
  theme: ThemePalette;
  focusBangumiId: number | null;
  /**
   * Pixels by which to lift the in-WebView map controls off the bottom edge.
   * The hub passes the floating tab bar's effective height so the +/-/locate
   * buttons stay tappable instead of getting buried under the dock.
   */
  controlsBottomOffset: number;
  onAnimePress: (bangumiId: number) => void;
}

function HubMapView({
  markers,
  userLocation,
  ringColor,
  theme,
  focusBangumiId,
  controlsBottomOffset,
  onAnimePress,
}: HubMapViewProps) {
  const webviewRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const styles = useMemo(() => makeMapStyles(theme), [theme]);

  // The HTML shell uses the cached origin so OSM tiles persist between
  // mounts. Re-rendering the HTML on every prop change destroys that cache,
  // so we capture once and push markers via injectJavaScript instead.
  //
  // Default center is Tokyo Station — Japan owns ~all pilgrimage data, and
  // users opening the map from Taipei/HK don't want to land on their home
  // city with zero markers and assume the feature is broken. Their location
  // is preserved as a pin and used by the locate-me bounds fit.
  const html = useMemo(() => {
    const center = { lat: TOKYO_STATION.lat, lng: TOKYO_STATION.lng, zoom: TOKYO_STATION.zoom };
    const user = userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : null;
    return buildHubMapHtml({ center, user, ringColor, controlsBottom: controlsBottomOffset });
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

  // Push user-location changes into the WebView so the pin and locate-me
  // bounds-fit stay accurate when permission is granted after mount.
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

  // Fly to a specific anime when the hero asks us to.
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
    <View style={styles.container} testID="pilgrimage-hub-map">
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
            <ThemedText variant="titleMedium" weight="600" align="center">
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

export default function PilgrimageHubScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const accentFg = readableTextOn(theme.accent);

  const [collectionAnimes, setCollectionAnimes] = useState<AnitabiBangumi[]>([]);
  const [featuredAnimes, setFeaturedAnimes] = useState<AnitabiBangumi[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(true);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [visited, setVisited] = useState<VisitedMap>({});
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'map' | 'list'>('list');

  const loading = collectionLoading || featuredLoading;

  useEffect(() => {
    let cancelled = false;
    setCollectionLoading(true);
    collectionPilgrimageService
      .getEntries()
      .then((entries) => {
        if (cancelled) return;
        const animes = entries
          .map((e) => e.anime)
          .filter((a): a is AnitabiBangumi => !!a)
          .sort((a, b) => (b.pointsLength ?? 0) - (a.pointsLength ?? 0));
        setCollectionAnimes(animes);
        setCollectionLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Collection failures shouldn't block the hub — featured backfill is
        // enough to render something useful.
        console.warn('[PilgrimageHub] collection load failed:', err);
        setCollectionAnimes([]);
        setCollectionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setFeaturedLoading(true);
    Promise.allSettled(
      FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) =>
        pilgrimageRepository.getSpotsByBangumiId(bangumiId)
      )
    )
      .then((results) => {
        if (cancelled) return;
        const fulfilled = results
          .filter(
            (r): r is PromiseFulfilledResult<AnitabiBangumi | null> =>
              r.status === 'fulfilled'
          )
          .map((r) => r.value)
          .filter((v): v is AnitabiBangumi => v !== null)
          .sort((a, b) => (b.pointsLength ?? 0) - (a.pointsLength ?? 0));
        setFeaturedAnimes(fulfilled);
        setFeaturedLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load');
        setFeaturedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadVisitedSpots().then((m) => {
      if (!cancelled) setVisited(m);
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

  // Merge: collection first, then backfill from featured (deduped by id).
  const animeCards = useMemo<AnimeCard[]>(() => {
    const seen = new Set<number>();
    const out: AnimeCard[] = [];
    for (const anime of collectionAnimes) {
      if (seen.has(anime.id)) continue;
      seen.add(anime.id);
      out.push({ anime, fromCollection: true });
    }
    if (out.length < COLLECTION_BACKFILL_TARGET) {
      for (const anime of featuredAnimes) {
        if (seen.has(anime.id)) continue;
        seen.add(anime.id);
        out.push({ anime, fromCollection: false });
        if (out.length >= COLLECTION_BACKFILL_TARGET) break;
      }
    }
    if (userLocation) {
      for (const card of out) {
        if (!isValidGeo(card.anime.geo)) continue;
        const d = locationService.getDistanceKm(userLocation, {
          latitude: card.anime.geo[0],
          longitude: card.anime.geo[1],
        });
        if (Number.isFinite(d)) card.distanceKm = d;
      }
    }
    return out;
  }, [collectionAnimes, featuredAnimes, userLocation]);

  const allSpots = useMemo<FeaturedSpot[]>(() => {
    const list: FeaturedSpot[] = [];
    for (const card of animeCards) {
      const points = card.anime.litePoints ?? [];
      for (const spot of points) {
        if (!isValidGeo(spot.geo)) continue;
        let distanceKm: number | undefined;
        if (userLocation) {
          const d = locationService.getDistanceKm(userLocation, {
            latitude: spot.geo[0],
            longitude: spot.geo[1],
          });
          if (Number.isFinite(d)) distanceKm = d;
        }
        list.push({ spot, anime: card.anime, distanceKm, fromCollection: card.fromCollection });
      }
    }
    return list;
  }, [animeCards, userLocation]);

  // Walk through tiers until we find a non-empty one, so users outside Japan
  // still see something meaningful (even if it just says "in Japan" with the
  // closest hub).
  const nearby = useMemo<{ tierLabel: string | null; list: AnimeCard[] }>(() => {
    if (!userLocation) return { tierLabel: null, list: [] };
    const sorted = animeCards
      .filter((c) => c.distanceKm !== undefined)
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    if (sorted.length === 0) return { tierLabel: null, list: [] };
    for (const tier of NEARBY_TIERS_KM) {
      const within = sorted.filter((c) => (c.distanceKm ?? Infinity) <= tier.km);
      if (within.length > 0) return { tierLabel: tier.label, list: within };
    }
    return { tierLabel: 'closest', list: sorted.slice(0, 5) };
  }, [animeCards, userLocation]);

  const nearbyAnime = nearby.list;
  const nearestAnime = nearbyAnime[0] ?? null;

  // Daily-stable seed so the city rotation feels deliberate, not jittery.
  const featuredSpots = useMemo<FeaturedSpot[]>(() => {
    const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const seed = (day * 31 + allSpots.length) >>> 0;
    return pickCityRepresentatives(allSpots, FEATURED_SPOT_LIMIT, seed);
  }, [allSpots]);

  const mapMarkers = useMemo<HubMapMarker[]>(() => {
    const seen = new Set<number>();
    const out: HubMapMarker[] = [];
    for (const card of animeCards) {
      if (seen.has(card.anime.id)) continue;
      if (!isValidGeo(card.anime.geo)) continue;
      seen.add(card.anime.id);
      out.push({
        bangumiId: card.anime.id,
        lat: card.anime.geo[0],
        lng: card.anime.geo[1],
        cover: card.anime.cover ?? '',
        title: card.anime.cn || card.anime.title,
        city: card.anime.city ?? '',
        pointsLength: card.anime.pointsLength ?? 0,
        ringColor: card.anime.color || theme.accent,
      });
    }
    return out;
  }, [animeCards, theme.accent]);

  const handleAnimePress = useCallback(
    (anime: AnitabiBangumi) => {
      Haptics.selectionAsync().catch(() => undefined);
      router.push(`/pilgrimage/${anime.id}`);
    },
    [router]
  );

  const handleAnimeIdPress = useCallback(
    (bangumiId: number) => {
      Haptics.selectionAsync().catch(() => undefined);
      router.push(`/pilgrimage/${bangumiId}`);
    },
    [router]
  );

  const handleSearch = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    // context=pilgrimage tells /search to route picked results to
    // /pilgrimage/[bangumiId] instead of /anime/[id] so the user stays
    // inside the pilgrimage flow.
    router.push({ pathname: '/search', params: { context: 'pilgrimage' } });
  }, [router]);

  const handleOpenAlbum = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push('/pilgrimage/album');
  }, [router]);

  const handleToggleMode = useCallback(
    (next: 'map' | 'list') => {
      Haptics.selectionAsync().catch(() => undefined);
      setMode(next);
    },
    []
  );

  // True fullscreen has to leave the Tabs container — pushing to a sibling
  // route registered with `tabBarStyle: { display: 'none' }` is the only way
  // to actually hide the bottom dock. Back from there returns to the hub.
  const openFullscreenMap = useCallback(
    (focusBangumiId?: number | null) => {
      Haptics.selectionAsync().catch(() => undefined);
      router.push({
        pathname: '/pilgrimage/map',
        params: focusBangumiId ? { focus: String(focusBangumiId) } : {},
      });
    },
    [router]
  );

  const handleHeroPress = useCallback(() => {
    // Hero opens the (true-fullscreen) map and centres on the nearest anime
    // if we have one. It does NOT jump into an anime detail page.
    openFullscreenMap(nearestAnime?.anime.id ?? null);
  }, [nearestAnime, openFullscreenMap]);

  const handleExpandInlineMap = useCallback(() => {
    openFullscreenMap(null);
  }, [openFullscreenMap]);

  const popularList = useMemo(() => animeCards.slice(0, POPULAR_LIMIT), [animeCards]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.headerBar}>
          <ThemedText variant="titleLarge" weight="700" style={styles.headerTitle}>
            聖地巡禮
          </ThemedText>
          <View style={styles.headerRight}>
            <View style={styles.segment}>
              <Pressable
                onPress={() => handleToggleMode('list')}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel="List view"
                style={[
                  styles.segmentBtn,
                  mode === 'list' && { backgroundColor: theme.background.tertiary },
                ]}>
                <Ionicons
                  name="list"
                  size={13}
                  color={mode === 'list' ? theme.text.primary : theme.text.tertiary}
                />
                <ThemedText
                  variant="captionSmall"
                  weight="600"
                  style={{
                    color: mode === 'list' ? theme.text.primary : theme.text.tertiary,
                  }}>
                  List
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => handleToggleMode('map')}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel="Map view"
                style={[
                  styles.segmentBtn,
                  mode === 'map' && { backgroundColor: theme.background.tertiary },
                ]}>
                <Ionicons
                  name="map"
                  size={13}
                  color={mode === 'map' ? theme.text.primary : theme.text.tertiary}
                />
                <ThemedText
                  variant="captionSmall"
                  weight="600"
                  style={{
                    color: mode === 'map' ? theme.text.primary : theme.text.tertiary,
                  }}>
                  Map
                </ThemedText>
              </Pressable>
            </View>
            <Pressable
              onPress={handleSearch}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Search"
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}>
              <Ionicons name="search" size={18} color={theme.text.primary} />
            </Pressable>
          </View>
        </View>

        {mode === 'map' ? (
          <View style={styles.mapWrap}>
            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={theme.accent} />
              </View>
            ) : mapMarkers.length === 0 ? (
              <View style={styles.emptyMap}>
                <Ionicons name="map-outline" size={32} color={theme.text.tertiary} />
                <ThemedText variant="bodyMedium" tone="secondary" align="center">
                  No anime with mapped pilgrimage locations yet.
                </ThemedText>
              </View>
            ) : (
              <HubMapView
                markers={mapMarkers}
                userLocation={userLocation}
                ringColor={theme.accent}
                theme={theme}
                focusBangumiId={null}
                // FloatingTabBar pill height (62) + bottom inset + ~14 breathing
                // room. The WebView is inside mapWrap with marginBottom 8, so
                // we subtract that to get the effective lift in WebView coords.
                controlsBottomOffset={Math.max(96, insets.bottom + 62 + 14 - 8)}
                onAnimePress={handleAnimeIdPress}
              />
            )}
            {mapMarkers.length > 0 ? (
              <Pressable
                onPress={handleExpandInlineMap}
                accessibilityRole="button"
                accessibilityLabel="Open fullscreen map"
                hitSlop={8}
                style={({ pressed }) => [
                  styles.mapInlineFab,
                  { backgroundColor: `${theme.background.primary}E0` },
                  pressed && { opacity: 0.8 },
                ]}>
                <Ionicons name="expand" size={16} color={theme.text.primary} />
              </Pressable>
            ) : null}
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + 120 },
            ]}
            showsVerticalScrollIndicator={false}>
            <View style={styles.intro}>
              <ThemedText
                variant="captionSmall"
                weight="700"
                style={[styles.introCaps, { color: theme.accent }]}>
                PLAN YOUR DAY
              </ThemedText>
              <ThemedText variant="bodySmall" style={styles.introBody}>
                {collectionAnimes.length > 0
                  ? 'Anime from your collection, plus picks near you.'
                  : 'Choose an anime and find walkable spots near you.'}
              </ThemedText>
            </View>

            <NearbyHero
              theme={theme}
              nearestAnime={nearestAnime}
              nearbyCount={nearbyAnime.length}
              tierLabel={nearby.tierLabel}
              hasLocation={!!userLocation}
              onPress={handleHeroPress}
            />

            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={theme.accent} />
              </View>
            ) : null}

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="warning-outline" size={20} color={theme.status.warning} />
                <ThemedText variant="bodySmall" tone="secondary" align="center">
                  {error}
                </ThemedText>
              </View>
            ) : null}

            {popularList.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader
                  title={
                    collectionAnimes.length > 0 ? 'Your Animes & More' : 'Popular Animes'
                  }
                  cta="See all"
                  onCta={handleOpenAlbum}
                  theme={theme}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.popularRow}>
                  {popularList.map((card) => (
                    <PopularCard
                      key={card.anime.id}
                      anime={card.anime}
                      visited={visited}
                      accent={theme.accent}
                      accentFg={accentFg}
                      theme={theme}
                      fromCollection={card.fromCollection}
                      distanceKm={card.distanceKm}
                      onPress={() => handleAnimePress(card.anime)}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {featuredSpots.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader
                  title="Featured Spots"
                  cta="View map"
                  onCta={() => handleToggleMode('map')}
                  theme={theme}
                />
                <View style={styles.spotList}>
                  {featuredSpots.map(({ spot, anime, distanceKm, fromCollection }) => (
                    <FeaturedSpotRow
                      key={`${anime.id}:${spot.id}`}
                      spot={spot}
                      anime={anime}
                      distanceKm={distanceKm}
                      fromCollection={fromCollection}
                      theme={theme}
                      onPress={() => handleAnimePress(anime)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

function NearbyHero({
  theme,
  nearestAnime,
  nearbyCount,
  tierLabel,
  hasLocation,
  onPress,
}: {
  theme: ThemePalette;
  nearestAnime: AnimeCard | null;
  nearbyCount: number;
  tierLabel: string | null;
  hasLocation: boolean;
  onPress: () => void;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const fgPin = readableTextOn(theme.accent);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open pilgrimage map"
      style={({ pressed }) => [styles.heroCard, pressed && { opacity: 0.92 }]}>
      <View style={styles.heroGrid} pointerEvents="none">
        {[60, 130, 200, 270, 330].map((x) => (
          <View
            key={`v${x}`}
            style={[styles.gridLineV, { left: x, backgroundColor: theme.glassBorder }]}
          />
        ))}
        {[34, 68, 102, 136].map((y) => (
          <View
            key={`h${y}`}
            style={[styles.gridLineH, { top: y, backgroundColor: theme.glassBorder }]}
          />
        ))}
        <View
          style={[
            styles.roadPath,
            { backgroundColor: theme.glassBorder, opacity: 0.55 },
          ]}
        />
      </View>

      {nearestAnime?.anime.cover ? (
        <Image
          source={{ uri: nearestAnime.anime.cover }}
          style={styles.heroCoverArt}
          contentFit="cover"
          transition={200}
        />
      ) : null}

      <View
        style={[styles.satPin, { left: 78, top: 48, backgroundColor: theme.background.tertiary }]}
      />
      <View
        style={[
          styles.satPin,
          {
            left: 266,
            top: 34,
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: theme.background.tertiary,
          },
        ]}
      />
      <View
        style={[
          styles.satPin,
          {
            left: 118,
            top: 118,
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: theme.background.tertiary,
          },
        ]}
      />

      <View
        style={[
          styles.primaryPin,
          {
            backgroundColor: theme.accent,
            borderColor: theme.background.primary,
            shadowColor: theme.accent,
          },
        ]}>
        <Ionicons name="location" size={12} color={fgPin} />
      </View>

      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.92)']}
        style={styles.heroOverlay}
        pointerEvents="none"
      />
      <View style={styles.heroBody}>
        <View style={styles.heroLabelRow}>
          <View
            style={[styles.heroPinBadge, { backgroundColor: theme.background.tertiary }]}>
            <Ionicons name="location" size={11} color={theme.text.primary} />
          </View>
          <ThemedText variant="bodySmall" weight="700">
            {hasLocation && nearbyCount > 0 && tierLabel
              ? `${nearbyCount} ${nearbyCount === 1 ? 'anime' : 'animes'} · ${tierLabel}`
              : 'Pilgrimage Map'}
          </ThemedText>
        </View>
        <ThemedText variant="captionSmall" tone="secondary" style={{ marginTop: 4 }}>
          {hasLocation
            ? nearestAnime
              ? `Closest: ${nearestAnime.anime.cn || nearestAnime.anime.title}${
                  nearestAnime.distanceKm !== undefined
                    ? ` · ${formatKm(nearestAnime.distanceKm)} away`
                    : ''
                }`
              : 'No mapped anime yet — tap to open the map'
            : 'Tap to browse pilgrimage spots across Japan'}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function SectionHeader({
  title,
  cta,
  onCta,
  theme,
}: {
  title: string;
  cta?: string;
  onCta?: () => void;
  theme: ThemePalette;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.sectionHeader}>
      <ThemedText variant="titleMedium" weight="700">
        {title}
      </ThemedText>
      {cta && onCta ? (
        <Pressable
          onPress={onCta}
          hitSlop={10}
          style={({ pressed }) => [styles.sectionCta, pressed && { opacity: 0.6 }]}>
          <ThemedText variant="captionSmall" weight="500" tone="secondary">
            {cta}
          </ThemedText>
          <Ionicons name="chevron-forward" size={12} color={theme.text.tertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function PopularCard({
  anime,
  visited,
  accent,
  accentFg,
  theme,
  fromCollection,
  distanceKm,
  onPress,
}: {
  anime: AnitabiBangumi;
  visited: VisitedMap;
  accent: string;
  accentFg: string;
  theme: ThemePalette;
  fromCollection: boolean;
  distanceKm?: number;
  onPress: () => void;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const total = anime.pointsLength ?? 0;
  const visitedCount = (anime.litePoints ?? []).filter((p) => visited[p.id]).length;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${anime.cn || anime.title} pilgrimage`}
      style={({ pressed }) => [styles.popularCard, pressed && { opacity: 0.9 }]}>
      <View style={styles.popularPosterWrap}>
        <Image
          source={{ uri: anime.cover }}
          style={styles.popularPoster}
          contentFit="cover"
          transition={180}
        />
        <View style={[styles.popularBadge, { backgroundColor: `${accent}E6` }]}>
          <ThemedText variant="captionSmall" weight="700" style={{ color: accentFg, fontSize: 10 }}>
            {total} spots
          </ThemedText>
        </View>
        {fromCollection ? (
          <View
            style={[
              styles.collectionBadge,
              { backgroundColor: `${theme.status.info}D9` },
            ]}>
            <Ionicons name="bookmark" size={9} color={readableTextOn(theme.status.info)} />
          </View>
        ) : null}
        {visitedCount > 0 ? (
          <View style={styles.popularVisited}>
            <Ionicons name="checkmark" size={10} color={theme.status.success} />
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: theme.status.success, fontSize: 9 }}>
              {visitedCount}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <View style={styles.popularMeta}>
        <ThemedText
          variant="captionSmall"
          weight="700"
          numberOfLines={1}
          style={{ fontSize: 12 }}>
          {anime.cn || anime.title}
        </ThemedText>
        <ThemedText
          variant="captionSmall"
          tone="tertiary"
          numberOfLines={1}
          style={{ fontSize: 10 }}>
          {distanceKm !== undefined
            ? `${formatKm(distanceKm)} · ${anime.city || '—'}`
            : anime.city || '—'}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function FeaturedSpotRow({
  spot,
  anime,
  distanceKm,
  fromCollection,
  theme,
  onPress,
}: {
  spot: AnitabiPoint;
  anime: AnitabiBangumi;
  distanceKm?: number;
  fromCollection: boolean;
  theme: ThemePalette;
  onPress: () => void;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${spot.cn || spot.name} from ${anime.cn || anime.title}`}
      style={({ pressed }) => [styles.spotRow, pressed && { opacity: 0.92 }]}>
      <Image
        source={{ uri: spot.image }}
        style={styles.spotThumb}
        contentFit="cover"
        transition={150}
      />
      <View style={styles.spotBody}>
        <View style={styles.spotTitleRow}>
          <ThemedText variant="bodySmall" weight="700" numberOfLines={1} style={{ flex: 1 }}>
            {spot.cn || spot.name}
          </ThemedText>
          {fromCollection ? (
            <View
              style={[
                styles.collectionPill,
                { backgroundColor: `${theme.status.info}1A`, borderColor: `${theme.status.info}66` },
              ]}>
              <Ionicons name="bookmark" size={9} color={theme.status.info} />
            </View>
          ) : null}
        </View>
        <View style={styles.spotMetaRow}>
          <Ionicons name="film-outline" size={10} color={theme.text.tertiary} />
          <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
            {anime.cn || anime.title}
            {anime.city ? ` · ${anime.city}` : ''}
          </ThemedText>
        </View>
        {distanceKm !== undefined ? (
          <View style={styles.spotDistRow}>
            <Ionicons name="navigate" size={10} color={theme.accent} />
            <ThemedText variant="captionSmall" weight="600" style={{ color: theme.accent }}>
              {formatKm(distanceKm)}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <View style={[styles.miniMap, { backgroundColor: theme.background.tertiary }]}>
        <LinearGradient
          colors={[`${theme.accent}1F`, 'rgba(0,0,0,0.0)']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[styles.miniMapPin, { backgroundColor: theme.accent }]} />
      </View>
    </Pressable>
  );
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background.primary },
    headerBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingTop: 8,
      paddingBottom: 4,
      gap: 12,
    },
    headerTitle: { fontSize: 22 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    segment: {
      flexDirection: 'row',
      borderRadius: 16,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      padding: 4,
      gap: 2,
    },
    segmentBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    scrollContent: { paddingHorizontal: 20, paddingTop: 20, gap: 22 },
    intro: { gap: 4 },
    introCaps: { letterSpacing: 1.2, fontSize: 12 },
    introBody: { lineHeight: 18 },
    heroCard: {
      height: 170,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    heroGrid: { ...StyleSheet.absoluteFillObject },
    heroCoverArt: {
      ...StyleSheet.absoluteFillObject,
      opacity: 0.18,
    },
    gridLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, opacity: 0.5 },
    gridLineH: { position: 'absolute', left: 0, right: 0, height: 1, opacity: 0.5 },
    roadPath: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 90,
      height: 2,
      transform: [{ rotate: '-4deg' }],
    },
    satPin: {
      position: 'absolute',
      width: 18,
      height: 18,
      borderRadius: 9,
      opacity: 0.85,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    primaryPin: {
      position: 'absolute',
      left: '50%',
      top: '40%',
      marginLeft: -14,
      marginTop: -14,
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.5,
      shadowRadius: 10,
      elevation: 6,
    },
    heroOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 78,
    },
    heroBody: { position: 'absolute', left: 16, right: 16, bottom: 14 },
    heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    heroPinBadge: {
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingBox: { alignItems: 'center', paddingVertical: 24 },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      backgroundColor: `${theme.status.warning}14`,
      borderColor: `${theme.status.warning}55`,
      borderWidth: 1,
      borderRadius: 14,
    },
    section: { gap: 12 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionCta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    popularRow: { gap: 12, paddingRight: 4 },
    popularCard: {
      width: 128,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    popularPosterWrap: {
      height: 148,
      width: '100%',
      backgroundColor: theme.background.tertiary,
    },
    popularPoster: { width: '100%', height: '100%' },
    popularBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
    },
    collectionBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    popularVisited: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderWidth: 1,
      borderColor: `${theme.status.success}66`,
    },
    popularMeta: { padding: 8, paddingHorizontal: 10, gap: 2 },
    spotList: { gap: 10 },
    spotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 10,
      borderRadius: 14,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    spotThumb: {
      width: 72,
      height: 72,
      borderRadius: 10,
      backgroundColor: theme.background.tertiary,
    },
    spotBody: { flex: 1, gap: 3 },
    spotTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    collectionPill: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    spotMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    spotDistRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    miniMap: {
      width: 56,
      height: 56,
      borderRadius: 10,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    miniMapPin: { width: 10, height: 10, borderRadius: 5 },
    mapWrap: {
      flex: 1,
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 8,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.secondary,
    },
    emptyMap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 20,
    },
    mapInlineFab: {
      position: 'absolute',
      top: 12,
      left: 12,
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.glassBorder,
      shadowColor: '#000',
      shadowOpacity: 0.35,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
  });
}

function makeMapStyles(theme: ThemePalette) {
  return StyleSheet.create({
    container: { flex: 1, overflow: 'hidden', backgroundColor: theme.background.secondary },
    webview: { flex: 1, backgroundColor: theme.background.secondary },
    fallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 20,
    },
  });
}
