// Grid of pilgrimage spots used on the /pilgrimage/[animeId] route.
// Each card shows the scene image, Japanese name, episode badge, and an
// "Open in Maps" deep link.
//
// Spec: spec/pilgrimage_spec.md §7 (PilgrimageSpotList) and §8 (Routes).

import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { AnitabiPoint } from '../../libs/services/pilgrimage/types';

export interface PilgrimageSpotListProps {
  points: readonly AnitabiPoint[];
  /**
   * Optional override for the URL opener (used by tests). Defaults to
   * React Native's {@link Linking.openURL}.
   */
  openURL?: (url: string) => Promise<unknown>;
}

/** True when the geo pair is real (not the [0,0] sentinel). */
export function hasValidGeo(point: AnitabiPoint): boolean {
  const [lat, lng] = point.geo ?? [0, 0];
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

export function buildMapsURL(lat: number, lng: number): string {
  // Apple Maps on iOS, Google Maps elsewhere.
  if (Platform.OS === 'ios') {
    return `https://maps.apple.com/?q=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function PilgrimageSpotList({ points, openURL }: PilgrimageSpotListProps) {
  const opener = openURL ?? Linking.openURL.bind(Linking);

  if (points.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No pilgrimage spots yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {points.map((point) => {
        const valid = hasValidGeo(point);
        const onMaps = () => {
          if (!valid) return;
          opener(buildMapsURL(point.geo[0], point.geo[1])).catch(() => undefined);
        };
        return (
          <View key={point.id} style={styles.card}>
            <Image
              source={{ uri: point.image }}
              style={styles.image}
              contentFit="cover"
              transition={200}
            />
            <View style={styles.episodeBadge}>
              <Text style={styles.episodeText}>EP {point.ep}</Text>
            </View>
            <View style={styles.body}>
              <Text style={styles.name} numberOfLines={2}>
                {point.name}
              </Text>
              {point.cn ? (
                <Text style={styles.nameCN} numberOfLines={1}>
                  {point.cn}
                </Text>
              ) : null}
              <Pressable
                style={[styles.mapsBtn, !valid && styles.mapsBtnDisabled]}
                onPress={onMaps}
                disabled={!valid}
                accessibilityRole="button"
                accessibilityLabel={`Open ${point.name} in maps`}>
                <Ionicons name="map" size={14} color={valid ? '#FFFFFF' : '#666666'} />
                <Text style={[styles.mapsText, !valid && styles.mapsTextDisabled]}>
                  {valid ? 'Open in Maps' : 'No coordinates'}
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: '#252528',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  image: {
    width: '100%',
    height: 120,
    backgroundColor: '#1B1B1D',
  },
  episodeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(27,27,29,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  episodeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  body: {
    padding: 10,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  nameCN: {
    color: '#A3A3A3',
    fontSize: 11,
    marginBottom: 8,
  },
  mapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingVertical: 6,
  },
  mapsBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  mapsText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  mapsTextDisabled: {
    color: '#666666',
  },
  emptyState: {
    paddingHorizontal: 16,
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
  },
});
