// SpotMapView — the Leaflet WebView used in pilgrimage detail's map mode.
// Memo'd so a chip-strip selection (which is a root state change) doesn't
// trigger a webview re-mount. Phase 4 splits the marker bridge so visited
// flips can be sent as `__updateVisited(ids)` instead of re-serializing the
// full marker payload.

import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { ThemedText } from '../../themed';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { useMapThemePref } from '../../../hooks/useMapThemePref';
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
import { getPilgrimageSpotTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import type { LatLng } from '../../../libs/services/pilgrimage/location-service';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import type { VisitedMap } from '../../../libs/services/pilgrimage/visited-prefs';
import type { MapMarkerMode } from '../../../hooks/usePilgrimageDetailView';
import { hasValidGeo } from './_helpers';

interface MapMarkerPayload {
  id: string;
  lat: number;
  lng: number;
  title: string;
  image: string;
  ep: number;
  ringColor: string;
  visited: boolean;
  markerMode: MapMarkerMode;
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
   * this changes, the WebView pans/zooms to that spot so the chip strip
   * doubles as a quick spot picker without forcing the modal sheet open.
   */
  focusSpotId?: string | null;
  onSpotPress: (spot: AnitabiPoint) => void;
  onClusterPick: (spots: readonly AnitabiPoint[]) => void;
  theme: ThemePalette;
  style?: StyleProp<ViewStyle>;
}

function buildSpotMapHtml(initial: {
  center: { lat: number; lng: number; zoom: number };
  user: { lat: number; lng: number } | null;
  ringColor: string;
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
  .map-btn.disabled { opacity: 0.4; pointer-events: none; }
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
  .spot-dot {
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--ring, #4285F4);
    border: 3px solid #ffffff;
    box-shadow: 0 1px 3px 0 rgba(0,0,0,0.30),
                0 3px 6px 2px rgba(0,0,0,0.18);
  }
  .spot-dot.visited {
    background: #34A853;
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
  var markerById = {};

  window.__updateMarkers = function(markers) {
    markerLayer.clearLayers();
    markerById = {};
    var batch = [];
    var bounds = [];
    for (var i = 0; i < markers.length; i++) {
      (function(m){
        var icon;
        if (m.markerMode === 'dot') {
          var dotCls = 'spot-dot' + (m.visited ? ' visited' : '');
          icon = L.divIcon({
            className: '',
            html: '<div class="' + dotCls + '" style="--ring:' + m.ringColor + '"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });
        } else {
          var cls = 'spot-marker' + (m.visited ? ' visited' : '');
          var photoInner = m.image ? '<img src="' + m.image + '" loading="lazy" />' : '';
          var html = '<div class="' + cls + '">' +
            '<div class="photo">' + photoInner + '</div>' +
            '<span class="region-dot" style="background:' + m.ringColor + '"></span>' +
            '<span class="ep">EP ' + m.ep + '</span>' +
          '</div>';
          icon = L.divIcon({ className: '', html: html, iconSize: [48, 57], iconAnchor: [24, 57] });
        }
        var marker = L.marker([m.lat, m.lng], { icon: icon, regionColor: m.ringColor });
        marker.__appId = m.id;
        marker.__markerMode = m.markerMode;
        marker.__visited = !!m.visited;
        marker.__image = m.image || '';
        marker.__ep = m.ep;
        marker.__ringColor = m.ringColor;
        markerById[m.id] = marker;
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
    if (!didFit && bounds.length > 0 && !initial.hasCenter) {
      try { map.setView(bounds[0], 13, { animate: false }); didFit = true; } catch (e) {}
    }
  };

  // Phase 4 helper: flip just the visited state of N markers without rebuilding
  // the full payload. Called when the user toggles visited from outside the map.
  window.__updateVisited = function(ids) {
    if (!ids || ids.length === 0) return;
    var visitedSet = {};
    for (var i = 0; i < ids.length; i++) visitedSet[ids[i]] = true;
    for (var id in markerById) {
      if (!Object.prototype.hasOwnProperty.call(markerById, id)) continue;
      var marker = markerById[id];
      var nextVisited = visitedSet[id] === true;
      if (marker.__visited === nextVisited) continue;
      marker.__visited = nextVisited;
      var icon;
      if (marker.__markerMode === 'dot') {
        var dotCls = 'spot-dot' + (nextVisited ? ' visited' : '');
        icon = L.divIcon({
          className: '',
          html: '<div class="' + dotCls + '" style="--ring:' + marker.__ringColor + '"></div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
      } else {
        var cls = 'spot-marker' + (nextVisited ? ' visited' : '');
        var photoInner = marker.__image ? '<img src="' + marker.__image + '" loading="lazy" />' : '';
        var html = '<div class="' + cls + '">' +
          '<div class="photo">' + photoInner + '</div>' +
          '<span class="region-dot" style="background:' + marker.__ringColor + '"></span>' +
          '<span class="ep">EP ' + marker.__ep + '</span>' +
        '</div>';
        icon = L.divIcon({ className: '', html: html, iconSize: [48, 57], iconAnchor: [24, 57] });
      }
      try { marker.setIcon(icon); } catch (e) {}
    }
  };

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

function SpotMapViewImpl({
  spots,
  visited,
  ringColor,
  userLocation,
  centerGeo,
  centerZoom,
  markerMode,
  offlineOnly,
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
  const previousMarkerSignatureRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const styles = useMemo(() => makeMapStyles(theme), [theme]);

  // First-paint HTML for the WebView. The center / theme vars are baked into
  // the initial JSON because re-rendering would wipe Leaflet's tile cache and
  // camera. Live changes are pushed via the bridge effects below.
  const html = useMemo(() => {
    const desiredZoom = Math.max(12, Math.min(15, centerZoom || 13));
    const hasCenter = !!(centerGeo && hasValidGeo(centerGeo));
    const fallback = hasCenter
      ? { lat: centerGeo![0], lng: centerGeo![1], zoom: desiredZoom }
      : { lat: TOKYO_STATION.lat, lng: TOKYO_STATION.lng, zoom: 13 };
    const user = userLocation
      ? { lat: userLocation.latitude, lng: userLocation.longitude }
      : null;
    const tileStyle: TileStyleId = resolveTileStyle(mapMode);
    const themeVars: MapThemeVars = buildMapThemeVars({
      effectiveMode: mapMode,
      accent: theme.accent,
      tileStyle,
    });
    return buildSpotMapHtml({
      center: fallback,
      user,
      ringColor,
      hasCenter,
      tileStyle,
      themeVars,
    });
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

  // Phase 4: split the marker push into two paths.
  // - `markerStructural` excludes visited — rebuilds only when ids / images /
  //   ep / markerMode / ringColor actually change.
  // - `visitedIdsKey` captures the visited delta separately.
  // - The bridge effect sends a heavy `__updateMarkers` payload only when the
  //   structural signature changes; visited-only flips send `__updateVisited`,
  //   a separate JS hook in the leaflet HTML that swaps icons in place.
  const markerStructural = useMemo(() => {
    const out: Omit<MapMarkerPayload, 'visited'>[] = [];
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
        markerMode,
      });
    }
    return out;
  }, [spots, ringColor, markerMode]);

  const markerSignature = useMemo(() => {
    let sig = '';
    for (const m of markerStructural) {
      sig += `${m.id}|${m.ep}|${m.image}|${m.markerMode}|${m.ringColor};`;
    }
    return sig;
  }, [markerStructural]);

  const visitedIdsKey = useMemo(() => {
    const ids: string[] = [];
    for (const m of markerStructural) if (visited[m.id] === true) ids.push(m.id);
    ids.sort();
    return ids.join(',');
  }, [markerStructural, visited]);

  useEffect(() => {
    if (!ready || !webviewRef.current) return;
    const structuralChanged = previousMarkerSignatureRef.current !== markerSignature;
    if (structuralChanged) {
      previousMarkerSignatureRef.current = markerSignature;
      // Bake current visited bits into the payload exactly once per structural
      // change. After this, visited deltas go through the lighter __updateVisited.
      const payload: MapMarkerPayload[] = markerStructural.map((m) => ({
        ...m,
        visited: visited[m.id] === true,
      }));
      const json = JSON.stringify(payload).replace(/</g, '\\u003c');
      webviewRef.current.injectJavaScript(`
        try { window.__updateMarkers && window.__updateMarkers(${json}); } catch(e) {}
        true;
      `);
      return;
    }
    // Visited-only change: send the much smaller id-list payload.
    const visitedIds = visitedIdsKey ? visitedIdsKey.split(',') : [];
    const json = JSON.stringify(visitedIds).replace(/</g, '\\u003c');
    webviewRef.current.injectJavaScript(`
      try { window.__updateVisited && window.__updateVisited(${json}); } catch(e) {}
      true;
    `);
  }, [markerSignature, visitedIdsKey, ready, markerStructural, visited]);

  useEffect(() => {
    if (!ready || !webviewRef.current) return;
    webviewRef.current.injectJavaScript(`
      try { window.__setOfflineOnly && window.__setOfflineOnly(${offlineOnly ? 'true' : 'false'}); } catch(e) {}
      true;
    `);
  }, [offlineOnly, ready]);

  useEffect(() => {
    if (!ready || !webviewRef.current || !focusSpotId) return;
    const spot = spotsById.current.get(focusSpotId);
    if (!spot || !hasValidGeo(spot.geo)) return;
    const payload = JSON.stringify({ lat: spot.geo[0], lng: spot.geo[1] });
    webviewRef.current.injectJavaScript(`
      try { window.__focusSpot && window.__focusSpot(${payload}); } catch(e) {}
      true;
    `);
  }, [focusSpotId, ready]);

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
    prev.onSpotPress === next.onSpotPress &&
    prev.onClusterPick === next.onClusterPick &&
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
