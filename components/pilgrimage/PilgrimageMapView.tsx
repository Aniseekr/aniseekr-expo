// Interactive map view for the pilgrimage feature.
// Renders one marker per anime at its `geo` center + a custom callout that
// triggers `onMarkerPress`. Falls back to a friendly "needs dev client"
// notice when react-native-maps fails to load (e.g. legacy Expo Go).
//
// Spec: spec/pilgrimage_spec.md §9 (Nearby discovery / Map).

import React, { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Shadow, Typography } from '../../constants/DesignSystem';
import type { AnitabiBangumi } from '../../libs/services/pilgrimage/types';

// Lazily resolve react-native-maps so we can show a graceful fallback if
// the native module isn't linked (Expo Go on SDK 54 ships a stub for
// MapView but several features are no-ops).
type Maps = typeof import('react-native-maps');
let mapsModule: Maps | null = null;
let mapsLoadError: unknown = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mapsModule = require('react-native-maps') as Maps;
} catch (err) {
  mapsLoadError = err;
}

export interface PilgrimageMapAnime {
  anime: AnitabiBangumi;
  distanceKm?: number;
}

export interface PilgrimageMapViewProps {
  animeList: ReadonlyArray<PilgrimageMapAnime>;
  userLocation?: { latitude: number; longitude: number } | null;
  onMarkerPress?: (anime: AnitabiBangumi) => void;
  style?: StyleProp<ViewStyle>;
}

/** Center of Japan, used as the default region. */
const JAPAN_CENTER = {
  latitude: 36.2048,
  longitude: 138.2529,
  latitudeDelta: 8,
  longitudeDelta: 8,
};

/** Tighter delta when we're following a real user fix. */
const USER_REGION_DELTA = { latitudeDelta: 0.5, longitudeDelta: 0.5 };

const isValidGeo = (geo: readonly [number, number] | null | undefined): geo is [number, number] => {
  if (!geo || geo.length < 2) return false;
  const [lat, lng] = geo;
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
};

export function PilgrimageMapView({
  animeList,
  userLocation,
  onMarkerPress,
  style,
}: PilgrimageMapViewProps) {
  const [mapError, setMapError] = useState<unknown>(mapsLoadError);

  const initialRegion = useMemo(() => {
    if (userLocation) {
      return {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        ...USER_REGION_DELTA,
      };
    }
    return JAPAN_CENTER;
  }, [userLocation]);

  if (!mapsModule || mapError) {
    return (
      <View style={[styles.fallback, style]} testID="pilgrimage-map-fallback">
        <Ionicons name="map-outline" size={32} color={Colors.text.secondary} />
        <Text style={styles.fallbackTitle}>Map requires dev client</Text>
        <Text style={styles.fallbackBody}>
          Maps are not available in this build. Run a development client (`expo run:ios`
          or `expo run:android`) to view the interactive map.
        </Text>
      </View>
    );
  }

  const MapView = mapsModule.default;
  const Marker = mapsModule.Marker;
  const Callout = mapsModule.Callout;
  // PROVIDER_DEFAULT keeps Apple Maps on iOS (no Google API key required).
  const providerDefault = mapsModule.PROVIDER_DEFAULT;

  return (
    <View style={[styles.container, style]} testID="pilgrimage-map">
      <MapView
        style={StyleSheet.absoluteFillObject}
        provider={providerDefault}
        initialRegion={initialRegion}
        showsUserLocation={Boolean(userLocation)}
        showsMyLocationButton={false}
        showsCompass={false}
        userInterfaceStyle="dark"
        onMapLoaded={() => setMapError(null)}
      >
        {animeList.map(({ anime }) => {
          if (!isValidGeo(anime.geo)) return null;
          const [lat, lng] = anime.geo;
          const ringColor = anime.color || Colors.primary;
          const cover = (anime.cover ?? '').replace('?plan=h160', '?plan=h120');

          return (
            <Marker
              key={anime.id}
              coordinate={{ latitude: lat, longitude: lng }}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={[styles.markerOuter, { borderColor: ringColor }]}>
                <View style={styles.markerInner}>
                  {cover ? (
                    <Image
                      source={{ uri: cover }}
                      style={styles.markerImage}
                      contentFit="cover"
                      transition={150}
                    />
                  ) : (
                    <Ionicons name="location" size={18} color={Colors.text.primary} />
                  )}
                </View>
              </View>

              <Callout tooltip onPress={() => onMarkerPress?.(anime)}>
                <View style={styles.callout}>
                  <Text style={styles.calloutTitle} numberOfLines={1}>
                    {anime.title}
                  </Text>
                  {anime.cn ? (
                    <Text style={styles.calloutSubtitle} numberOfLines={1}>
                      {anime.cn}
                    </Text>
                  ) : null}
                  <View style={styles.calloutMeta}>
                    <Ionicons name="pin" size={11} color={Colors.text.secondary} />
                    <Text style={styles.calloutMetaText}>
                      {anime.pointsLength}{' '}
                      {anime.pointsLength === 1 ? 'spot' : 'spots'}
                    </Text>
                    {anime.city ? (
                      <>
                        <View style={styles.calloutDot} />
                        <Text style={styles.calloutMetaText} numberOfLines={1}>
                          {anime.city}
                        </Text>
                      </>
                    ) : null}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    style={[styles.calloutBtn, { backgroundColor: ringColor }]}
                    onPress={() => onMarkerPress?.(anime)}
                  >
                    <Text style={styles.calloutBtnText}>Open</Text>
                  </Pressable>
                </View>
              </Callout>
            </Marker>
          );
        })}
      </MapView>
    </View>
  );
}

const MARKER_SIZE = 44;
const MARKER_INNER = 38;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
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
  markerOuter: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: Radius.md,
    borderWidth: 2,
    backgroundColor: Colors.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Shadow.medium as object),
  },
  markerInner: {
    width: MARKER_INNER,
    height: MARKER_INNER,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.background.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerImage: {
    width: '100%',
    height: '100%',
  },
  callout: {
    minWidth: 200,
    maxWidth: 240,
    padding: 10,
    backgroundColor: Colors.background.secondary,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    ...(Shadow.medium as object),
    gap: 6,
  },
  calloutTitle: {
    ...Typography.titleSmall,
    color: Colors.text.primary,
  },
  calloutSubtitle: {
    ...Typography.captionSmall,
    color: Colors.text.secondary,
  },
  calloutMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  calloutMetaText: {
    ...Typography.captionSmall,
    color: Colors.text.secondary,
  },
  calloutDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.text.tertiary,
    marginHorizontal: 2,
  },
  calloutBtn: {
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calloutBtnText: {
    ...Typography.titleSmall,
    color: Colors.background.primary,
  },
});
