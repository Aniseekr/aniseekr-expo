// Interactive map view for the pilgrimage feature.
// Uses Leaflet + OpenStreetMap tiles inside a WebView so the map works on
// Android without a Google Maps API key and on iOS without Apple's MapKit
// quirks. Markers post `{ type: 'markerPress', id }` back to native, which
// triggers `onMarkerPress`.

import React, { useMemo, useRef } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Typography } from '../../constants/DesignSystem';
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

const JAPAN_CENTER = { lat: 36.2048, lng: 138.2529, zoom: 5 };
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

function buildHtml(
  markers: MarkerPayload[],
  center: { lat: number; lng: number; zoom: number },
  user: { lat: number; lng: number } | null
): string {
  const json = JSON.stringify({ markers, center, user }).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #1c1c1e; }
  .ani-marker {
    width: 44px; height: 44px; border-radius: 12px;
    border: 2px solid var(--ring, #FF9F0A);
    background: #1c1c1e;
    overflow: hidden;
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
  .leaflet-control-attribution { font-size: 9px; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function() {
  var data = ${json};
  var post = function(payload) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  };
  var map = L.map('map', { zoomControl: false, attributionControl: true })
    .setView([data.center.lat, data.center.lng], data.center.zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  if (data.user) {
    L.circleMarker([data.user.lat, data.user.lng], {
      radius: 7, color: '#0A84FF', weight: 2, fillColor: '#0A84FF', fillOpacity: 0.85
    }).addTo(map);
  }
  data.markers.forEach(function(m) {
    var ring = m.inCollection ? '#30D158' : m.ringColor;
    var cls = 'ani-marker' + (m.inCollection ? ' in-collection' : '');
    var html = '<div class="' + cls + '" style="--ring:' + ring + '">' +
      (m.cover ? '<img src="' + m.cover + '" />' : '<span class="pin">📍</span>') +
      (m.inCollection ? '<span class="check">✓</span>' : '') +
      '</div>';
    var icon = L.divIcon({ className: '', html: html, iconSize: [44,44], iconAnchor: [22,22] });
    var marker = L.marker([m.lat, m.lng], { icon: icon }).addTo(map);
    var meta = m.pointsLength + ' spot' + (m.pointsLength === 1 ? '' : 's') +
      (m.city ? ' · ' + m.city : '') +
      (m.inCollection ? ' · ✓ in collection' : '');
    var popup = '<div>' +
      '<div class="pop-title">' + (m.title || 'Untitled') + '</div>' +
      '<div class="pop-meta">' + meta + '</div>' +
      '<button class="pop-btn" style="background:' + ring + '" onclick="window.__open(\\'' + m.id + '\\')">Open</button>' +
    '</div>';
    marker.bindPopup(popup, { closeButton: false, offset: [0, -18] });
  });
  window.__open = function(id) { post({ type: 'markerPress', id: id }); };
  post({ type: 'ready' });
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
  const animeById = useRef(new Map<string, AnitabiBangumi>());

  const html = useMemo(() => {
    const markers: MarkerPayload[] = [];
    animeById.current.clear();
    for (const { anime, inCollection } of animeList) {
      if (!isValidGeo(anime.geo)) continue;
      const [lat, lng] = anime.geo;
      const idStr = String(anime.id);
      animeById.current.set(idStr, anime);
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
    const center = userLocation
      ? { lat: userLocation.latitude, lng: userLocation.longitude, zoom: USER_ZOOM }
      : JAPAN_CENTER;
    const user = userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : null;
    return buildHtml(markers, center, user);
  }, [animeList, userLocation]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        type: string;
        id?: string;
      };
      if (data.type === 'markerPress' && data.id) {
        const anime = animeById.current.get(data.id);
        if (anime) onMarkerPress?.(anime);
      }
    } catch {
      // ignore malformed messages
    }
  };

  return (
    <View style={[styles.container, style]} testID="pilgrimage-map">
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
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
    </View>
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
