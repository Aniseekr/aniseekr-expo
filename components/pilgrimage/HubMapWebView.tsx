// Pilgrimage hub map — Leaflet-in-WebView surface, extracted from
// app/(tabs)/pilgrimage/map.tsx so it can be reused by a future shared host.
//
// Self-contained unit: it owns the HTML builder (`buildHubMapHtml`), the
// marker shape (`HubMapMarker`), the region bounding-box shape (`RegionBounds`)
// and the imperative handle (`HubMapWebViewHandle`). The hub screen renders it
// inline and drives it through props + the handle. Behaviour is identical to
// the previous inline `HubMapBackground` — this is a pure relocation.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { ThemedText } from '../themed';
import { type LatLng } from '../../libs/services/pilgrimage/location-service';
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
  TILE_STYLES,
  buildMapThemeVars,
  resolveTileStyle,
  type MapThemeVars,
  type TileStyleId,
} from '../../libs/services/pilgrimage/leaflet-map';
import { resolveMapMode } from '../../libs/services/pilgrimage/map-theme-prefs';
import { useMapThemePref } from '../../hooks/useMapThemePref';
import { type BoundingBox } from '../../libs/services/pilgrimage/anitabi-index';
import { MAP_LOCATE_ZOOM } from '../../libs/services/pilgrimage/map-nearby';
import { useT } from '../../libs/i18n';
// `HubMapMarker` + `RegionBounds` now live in the engine-neutral map layer so
// the normaliser doesn't import from this Leaflet component. Re-exported below
// for back-compat with existing call sites until this component is removed.
import type { HubMapMarker, RegionBounds } from '../../libs/services/pilgrimage/map-engine/hub-marker';

export type { HubMapMarker, RegionBounds };

// Whole-archipelago framing: centre on the Sea of Japan side of central
// Honshu so Hokkaido and Okinawa both stay on-screen at zoom 5.
const JAPAN_OVERVIEW = { lat: 36.5, lng: 138.0, zoom: 5 } as const;

// Eighty-eight selection mark colour — picked for "official certification"
// connotation (vs. theme.accent which can drift between user themes).
export const OFFICIAL_88_GOLD = '#D4AF37';

function buildHubMapHtml(initial: {
  center: { lat: number; lng: number; zoom: number };
  user: { lat: number; lng: number } | null;
  ringColor: string;
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
  /* Google-Maps-style balloon marker. See PilgrimageMapView for the
     full design rationale — same shape language across all 3 maps. */
  .anime-marker {
    position: relative;
    width: 48px; height: 48px; border-radius: 50%;
    border: 3px solid #ffffff;
    background: var(--map-chrome);
    overflow: visible;
    box-shadow: 0 1px 3px 0 rgba(0,0,0,0.30),
                0 4px 8px 3px rgba(0,0,0,0.15);
  }
  .anime-marker .photo {
    width: 100%; height: 100%; border-radius: 50%; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
  }
  .anime-marker .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .anime-marker::after {
    content: ''; position: absolute;
    bottom: -8px; left: 50%; transform: translateX(-50%);
    width: 0; height: 0;
    border-left: 7px solid transparent;
    border-right: 7px solid transparent;
    border-top: 9px solid #ffffff;
    filter: drop-shadow(0 2px 1px rgba(0,0,0,0.18));
  }
  .anime-marker .region-dot {
    position: absolute; right: -2px; bottom: 2px;
    width: 14px; height: 14px; border-radius: 50%;
    background: var(--ring, #4285F4);
    border: 2px solid #ffffff;
    box-shadow: 0 1px 2px rgba(0,0,0,0.25);
  }
  .anime-marker .pts {
    position: absolute; left: -4px; top: -4px;
    min-width: 18px; height: 18px; padding: 0 4px;
    background: #ffffff; color: #1F1F1F;
    border-radius: 9px;
    font: 700 10px 'Google Sans Text', Roboto, system-ui, sans-serif;
    line-height: 18px; text-align: center;
    box-shadow: 0 1px 2px rgba(0,0,0,0.25);
  }
  /* Tourism 88 official-selection pins: gold disc + star, slightly smaller
     to read as "stamps of approval" against the regular photo balloons. */
  .anime-marker.eighty-eight {
    width: 36px; height: 36px;
    background: ${OFFICIAL_88_GOLD};
    color: #1F1F1F;
    font: 800 18px 'Google Sans Text', Roboto, system-ui, sans-serif;
    display: flex; align-items: center; justify-content: center;
  }
  .anime-marker.eighty-eight::after { border-top-color: #ffffff; }
  .anime-marker.eighty-eight .star { line-height: 1; }
  .anime-marker.eighty-eight .pts { display: none; }
  .anime-marker.eighty-eight .region-dot { display: none; }
  .anime-marker.eighty-eight .eighty-id {
    position: absolute; right: -6px; bottom: 0;
    min-width: 18px; height: 16px; padding: 0 4px;
    background: #ffffff; color: ${OFFICIAL_88_GOLD};
    border-radius: 8px;
    font: 800 9px 'Google Sans Text', Roboto, system-ui, sans-serif;
    line-height: 16px; text-align: center;
    box-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }

  /* Individual nearby scene points — a smaller photo balloon than the anime
     centroid markers, so they read as finer-grained "scenes around you". */
  .spot-pin {
    position: relative;
    width: 38px; height: 38px; border-radius: 50%;
    border: 2.5px solid #ffffff;
    background: var(--map-chrome);
    overflow: visible;
    box-shadow: 0 1px 3px 0 rgba(0,0,0,0.30), 0 4px 8px 3px rgba(0,0,0,0.15);
  }
  .spot-pin .photo {
    width: 100%; height: 100%; border-radius: 50%; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
  }
  .spot-pin .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .spot-pin::after {
    content: ''; position: absolute;
    bottom: -7px; left: 50%; transform: translateX(-50%);
    width: 0; height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 8px solid #ffffff;
    filter: drop-shadow(0 2px 1px rgba(0,0,0,0.18));
  }
  .spot-pin .ring {
    position: absolute; right: -3px; bottom: 0;
    width: 13px; height: 13px; border-radius: 50%;
    border: 2px solid #ffffff;
    box-shadow: 0 1px 2px rgba(0,0,0,0.25);
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
  new window.CachedTileLayer(${JSON.stringify(tile.url)}, {
    maxZoom: ${tile.maxZoom}, minZoom: 3,
    subdomains: ${JSON.stringify(tile.subdomains)},
    attribution: ${JSON.stringify(tile.attribution)},
    keepBuffer: 4, updateWhenIdle: false
  }).addTo(map);

  // See index.tsx for the rationale behind the post-mount user pin update.
  var userMarker = null;
  var didSnapToUser = false;
  // Last compass heading (deg) pushed from native; re-applied whenever the
  // user marker is rebuilt so a location update never drops the cone.
  var lastHeading = null;
  function applyUserHeading() {
    if (!userMarker || lastHeading == null) return;
    var el = userMarker.getElement();
    var cone = el && el.querySelector ? el.querySelector('.user-heading') : null;
    if (!cone) return;
    cone.style.transform = 'rotate(' + lastHeading + 'deg)';
    cone.classList.add('active');
  }
  function applyUser(user) {
    if (userMarker) { try { map.removeLayer(userMarker); } catch (e) {} userMarker = null; }
    if (user && typeof user.lat === 'number' && typeof user.lng === 'number') {
      var userIcon = L.divIcon({ className: '', html: '<div class="user-loc"><div class="user-heading"></div><div class="user-pulse"></div></div>', iconSize: [16,16], iconAnchor: [8,8] });
      userMarker = L.marker([user.lat, user.lng], { icon: userIcon, interactive: false, keyboard: false }).addTo(map);
      applyUserHeading();
      // First time we get a real location fix, snap the camera to a local
      // ~10-30 km framing around the user. Permission usually resolves
      // after the WebView is up, so we can't just rely on the initial
      // setView. We don't repeat this on subsequent updates — the user is
      // already framed; rough GPS noise shouldn't yank the map around.
      if (!didSnapToUser) {
        didSnapToUser = true;
        try { map.flyTo([user.lat, user.lng], ${MAP_LOCATE_ZOOM}, { duration: 0.4 }); } catch (e) {}
      }
    }
    initial.user = user;
  }
  applyUser(initial.user);
  window.__updateUser = applyUser;

  // Native pushes the device compass heading here; rotate the cone in place.
  // A null/non-finite value clears the cone — never show a fake direction.
  window.__updateHeading = function(deg) {
    lastHeading = typeof deg === 'number' && isFinite(deg) ? deg : null;
    if (lastHeading == null) {
      if (userMarker) {
        var el = userMarker.getElement();
        var cone = el && el.querySelector ? el.querySelector('.user-heading') : null;
        if (cone) cone.classList.remove('active');
      }
      return;
    }
    applyUserHeading();
  };

  // The recenter button now lives outside the WebView; __bindMap is called
  // with just the map (__recenter + __updateHeading from MAP_BASE_JS handle
  // the native FAB commands). Keeping the call here installs the shared
  // userPanned dragstart listener.
  window.__bindMap(map);

  var clusterLayer = window.__makeClusterGroup({ ringColor: initial.ringColor, disableAt: 12 });
  clusterLayer.addTo(map);

  // Dedup so we can call __updateMarkers(union) repeatedly without
  // re-rendering existing markers. The map-bounds lazy loader appends new
  // entries to the same state and re-injects the full union every change;
  // additive handling here avoids flicker and unnecessary DOM churn.
  //
  // markerId is "bgm:<bangumi>" for Anitabi-centroid pins and "88:<entryId>"
  // for Tourism 88 city pins — that lets one anime carry multiple 88 markers
  // (e.g. ゆるキャン△ has 6 cities) without collapsing.
  var loadedIds = new Set();

  // When the React side toggles a filter (Official 88 / region) it injects
  // with replace=true so we wipe and rebuild instead of accumulating stale
  // markers from the previous filter set.
  window.__updateMarkers = function(markers, replace) {
    if (replace) {
      try { clusterLayer.clearLayers(); } catch (e) {}
      loadedIds = new Set();
    }
    var batch = [];
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      var mid = m.markerId || ('bgm:' + m.bangumiId);
      if (loadedIds.has(mid)) continue;
      loadedIds.add(mid);
      (function(m, mid){
        var cls = 'anime-marker' + (m.is88 ? ' eighty-eight' : '');
        var inner;
        if (m.is88) {
          inner = '<span class="star">★</span>' +
            '<span class="eighty-id">#' + (m.eightyEightId || '?') + '</span>';
        } else {
          var photoInner = m.cover
            ? '<img src="' + m.cover + '" loading="lazy" />'
            : '';
          inner = '<div class="photo">' + photoInner + '</div>' +
            '<span class="region-dot" style="background:' + m.ringColor + '"></span>' +
            '<span class="pts">' + m.pointsLength + '</span>';
        }
        // Bounding box: bubble + 9px tail. Anchor at tail tip so the geo
        // coordinate sits *under* the marker (Google Maps convention).
        var w = m.is88 ? 36 : 48;
        var h = w + 9;
        var html = '<div class="' + cls + '">' + inner + '</div>';
        var icon = L.divIcon({ className: '', html: html, iconSize: [w, h], iconAnchor: [w/2, h] });
        var marker = L.marker([m.lat, m.lng], { icon: icon, regionColor: m.ringColor });
        marker.__appId = m.bangumiId;
        marker.on('click', function() {
          window.__post({ type: 'animePress', id: m.bangumiId, is88: !!m.is88, eightyEightId: m.eightyEightId || null });
        });
        batch.push(marker);
      })(m, mid);
    }
    if (batch.length === 0 && !replace) return;
    if (typeof clusterLayer.addLayers === 'function') clusterLayer.addLayers(batch);
    else for (var k = 0; k < batch.length; k++) clusterLayer.addLayer(batch[k]);

    // Do NOT auto fit-to-all-markers. Pilgrimage points span the whole
    // archipelago — fitting them all dropped the camera to ~zoom 6 (a
    // country map), which made the screen feel like an atlas instead of
    // "what's around me". We keep the initial setView and let the locate
    // button ask native for a real GPS fix instead of treating all loaded
    // markers as a fallback.
  };

  window.__focusAnime = function(target) {
    if (!target || typeof target.lat !== 'number') return;
    try { map.flyTo([target.lat, target.lng], 11, { duration: 0.6 }); } catch (e) {}
  };

  // Individual nearby scene points live in their own cluster layer above the
  // anime centroids. They cluster until zoom 15, so panning out shows a count
  // bubble and zooming in reveals each real-world location.
  var spotLayer = window.__makeClusterGroup({ ringColor: initial.ringColor, disableAt: 15 });
  spotLayer.addTo(map);

  window.__updateSpots = function(spots) {
    try { spotLayer.clearLayers(); } catch (e) {}
    if (!spots || !spots.length) return;
    var batch = [];
    for (var i = 0; i < spots.length; i++) {
      (function(s){
        var ring = s.ringColor || initial.ringColor;
        var photoInner = s.image ? '<img src="' + s.image + '" loading="lazy" />' : '';
        var html = '<div class="spot-pin">' +
          '<div class="photo">' + photoInner + '</div>' +
          '<span class="ring" style="background:' + ring + '"></span>' +
        '</div>';
        var icon = L.divIcon({ className: '', html: html, iconSize: [38, 46], iconAnchor: [19, 46] });
        var marker = L.marker([s.lat, s.lng], { icon: icon, regionColor: ring });
        marker.on('click', function() {
          try { map.flyTo([s.lat, s.lng], Math.max(map.getZoom(), 16), { duration: 0.4 }); } catch (e) {}
        });
        batch.push(marker);
      })(spots[i]);
    }
    if (typeof spotLayer.addLayers === 'function') spotLayer.addLayers(batch);
    else for (var k = 0; k < batch.length; k++) spotLayer.addLayer(batch[k]);
  };

  // React side asks the map to fly to a spot tapped in the Nearby panel.
  window.__focusSpot = function(t) {
    if (!t || typeof t.lat !== 'number' || typeof t.lng !== 'number') return;
    try { map.flyTo([t.lat, t.lng], Math.max(map.getZoom(), 16), { duration: 0.5 }); } catch (e) {}
  };

  // Fly the camera to a region (or whole Japan). Pure navigation — does NOT
  // change which markers are visible. The bounds-based lazy loader picks up
  // the markers that fall into the new viewport on its own.
  window.__flyToBounds = function(b) {
    if (!b || typeof b.south !== 'number') return;
    try {
      map.flyToBounds(
        [[b.south, b.west], [b.north, b.east]],
        { padding: [40, 40], maxZoom: 10, duration: 0.6 }
      );
    } catch (e) {}
  };

  // Emit current bounds to RN so it can lazy-load more anime from the
  // offline index. Debounced inside the WebView (300 ms) — Leaflet's
  // moveend fires once per gesture, but pinch-zoom on iOS can chain a
  // few in quick succession.
  var boundsTimer = null;
  function emitBounds() {
    if (boundsTimer) { clearTimeout(boundsTimer); }
    boundsTimer = setTimeout(function() {
      try {
        var b = map.getBounds();
        window.__post({
          type: 'bounds',
          n: b.getNorth(), s: b.getSouth(),
          e: b.getEast(), w: b.getWest(),
        });
      } catch (e) { /* noop */ }
    }, 300);
  }
  map.on('moveend', emitBounds);

  window.__post({ type: 'ready' });
  emitBounds();
})();
</script>
</body>
</html>`;
}

interface HubMapWebViewProps {
  markers: readonly HubMapMarker[];
  /** Bump when the marker set transitions to a different filter view; triggers a clear+rebuild. */
  replaceKey: string;
  userLocation: LatLng | null;
  ringColor: string;
  theme: ThemePalette;
  focusBangumiId: number | null;
  /** When set, fly the camera to this bounding box. The key changes each time so re-tapping the same region re-flies. */
  flyBoundsRequest: { key: string; bounds: RegionBounds } | null;
  onAnimePress: (bangumiId: number) => void;
  onBoundsChange: (bounds: BoundingBox) => void;
  /** Notified the moment the user drags the map (Leaflet `dragstart`). The
   *  consumer drops out of follow/compass on this signal. */
  onUserPan: () => void;
}

export interface HubMapWebViewHandle {
  /** Fly the camera to a target location (used by the locate FAB). */
  recenter: (lat: number, lng: number, zoom?: number, opts?: { animate?: boolean }) => void;
  /** Push the device heading (or null to clear the cone) into the WebView. */
  setHeading: (deg: number | null) => void;
}

export const HubMapWebView = forwardRef<HubMapWebViewHandle, HubMapWebViewProps>(function HubMapWebView({
  markers,
  replaceKey,
  userLocation,
  ringColor,
  theme,
  focusBangumiId,
  flyBoundsRequest,
  onAnimePress,
  onBoundsChange,
  onUserPan,
}: HubMapWebViewProps, ref) {
  const { effectiveMode } = useTheme();
  const t = useT();
  const { pref: mapThemePref } = useMapThemePref();
  const mapMode = resolveMapMode(mapThemePref, effectiveMode);
  const webviewRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const lastReplaceKey = useRef(replaceKey);

  const html = useMemo(() => {
    // Default to a whole-Japan framing so the user can pick a region before
    // drilling into a city. applyUser() still snaps to the user's location
    // at a local zoom the first time GPS resolves — so locals don't have to
    // pan back. The region chips fly the camera into specific regions on demand.
    const center = { lat: JAPAN_OVERVIEW.lat, lng: JAPAN_OVERVIEW.lng, zoom: JAPAN_OVERVIEW.zoom };
    const user = userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : null;
    const tileStyle: TileStyleId = resolveTileStyle(mapMode);
    const themeVars: MapThemeVars = buildMapThemeVars({
      effectiveMode: mapMode,
      accent: theme.accent,
      tileStyle,
    });
    return buildHubMapHtml({ center, user, ringColor, tileStyle, themeVars });
    // First-paint values captured once. Live theme updates pushed via the
    // bridge effect below — re-rendering would wipe tile cache + camera state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Android react-native-webview reloads HTML when a fresh `source` map is sent
  // over the native bridge. Keep the source object stable across host re-renders
  // so marker/theme/location updates stay on the injectJavaScript path.
  const webViewSource = useMemo(() => ({ html, baseUrl: MAP_BASE_URL }), [html]);

  useEffect(() => {
    if (!ready || !webviewRef.current) return;
    const replace = lastReplaceKey.current !== replaceKey;
    lastReplaceKey.current = replaceKey;
    const json = JSON.stringify(markers).replace(/</g, '\\u003c');
    webviewRef.current.injectJavaScript(`
      try { window.__updateMarkers && window.__updateMarkers(${json}, ${replace ? 'true' : 'false'}); } catch(e) {}
      true;
    `);
  }, [markers, replaceKey, ready]);

  // Live tile + chrome theme push so toggling light/dark or changing accent
  // repaints in place — no WebView remount, no tile cache loss.
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

  // Imperative recenter / heading API for the parent screen. The locate FAB
  // calls these from the tracking hook so neither location ticks nor 60 Hz
  // magnetometer ticks have to flow through React state (CLAUDE.md Rule 9).
  useImperativeHandle(
    ref,
    () => ({
      recenter: (lat, lng, zoom, opts) => {
        if (!ready || !webviewRef.current) return;
        const z = typeof zoom === 'number' ? zoom : 'undefined';
        const animate = opts?.animate === false ? 'false' : 'true';
        webviewRef.current.injectJavaScript(`
          try { window.__recenter && window.__recenter(${lat}, ${lng}, ${z}, { animate: ${animate} }); } catch(e) {}
          true;
        `);
      },
      setHeading: (deg) => {
        if (!ready || !webviewRef.current) return;
        const payload = deg === null || !Number.isFinite(deg) ? 'null' : String(deg);
        webviewRef.current.injectJavaScript(`
          try { window.__updateHeading && window.__updateHeading(${payload}); } catch(e) {}
          true;
        `);
      },
    }),
    [ready]
  );

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

  // Region/Japan camera fly. Re-running on `key` lets the user re-tap the
  // same region chip and have the camera re-frame (useful after pan/zoom).
  useEffect(() => {
    if (!ready || !webviewRef.current || !flyBoundsRequest) return;
    const payload = JSON.stringify(flyBoundsRequest.bounds);
    webviewRef.current.injectJavaScript(`
      try { window.__flyToBounds && window.__flyToBounds(${payload}); } catch(e) {}
      true;
    `);
  }, [flyBoundsRequest, ready]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        type: string;
        id?: number;
        n?: number;
        s?: number;
        e?: number;
        w?: number;
      };
      if (data.type === 'ready') {
        setReady(true);
        return;
      }
      if (data.type === 'animePress' && typeof data.id === 'number') {
        onAnimePress(data.id);
        return;
      }
      if (data.type === 'userPanned') {
        onUserPan();
        return;
      }
      if (
        data.type === 'bounds' &&
        typeof data.n === 'number' &&
        typeof data.s === 'number' &&
        typeof data.e === 'number' &&
        typeof data.w === 'number'
      ) {
        onBoundsChange({ north: data.n, south: data.s, east: data.e, west: data.w });
      }
    } catch {
      // ignore
    }
  };

  return (
    <WebView
      ref={webviewRef}
      originWhitelist={['*']}
      source={webViewSource}
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
            {t('pilgrimage.map.mapLoadError')}
          </ThemedText>
        </View>
      )}
      startInLoadingState
    />
  );
});
HubMapWebView.displayName = 'HubMapWebView';

// Module-scoped styles for the WebView's renderError fallback so the
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
