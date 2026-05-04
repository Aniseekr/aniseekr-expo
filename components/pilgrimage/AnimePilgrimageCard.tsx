// Ported verbatim from japanwalker/components/AnimePilgrimageCard.tsx
// Only the AnitabiBangumi type import has been redirected to the local
// libs/services/pilgrimage/types module.

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import type { AnitabiBangumi } from '../../libs/services/pilgrimage/types';

export interface AnimePilgrimageCardProps {
  anime: AnitabiBangumi;
  /** Optional distance from the user, in kilometres. */
  distance?: number;
  /** Show a green check badge when this anime is in the user's collection. */
  inCollection?: boolean;
  /** Optional sub-label (e.g. "Watching · ep 3") rendered next to the city tag. */
  collectionLabel?: string;
  onPress?: (anime: AnitabiBangumi) => void;
}

export function AnimePilgrimageCard({
  anime,
  distance,
  inCollection,
  collectionLabel,
  onPress,
}: AnimePilgrimageCardProps) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.(anime);
  };

  const formatDistance = (km: number): string => {
    if (km < 1) return `${Math.round(km * 1000)}m`;
    return `${km.toFixed(1)}km`;
  };

  const themeColor = anime.color || '#8DC5D8';

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
        { borderColor: inCollection ? '#30D158' : `${themeColor}30` },
        inCollection && styles.cardInCollection,
      ]}>
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: (anime.cover ?? '').replace('?plan=h160', '?plan=h360') }}
          style={styles.image}
          contentFit="cover"
          transition={200}
        />
        <LinearGradient
          colors={['transparent', `${themeColor}40`, 'rgba(27, 27, 29, 0.95)']}
          style={styles.imageGradient}
        />

        {distance !== undefined && (
          <View style={[styles.distanceBadge, { backgroundColor: `${themeColor}E0` }]}>
            <Text style={styles.distanceText}>{formatDistance(distance)}</Text>
          </View>
        )}

        <View style={styles.spotCountBadge}>
          <Text style={styles.spotCountText}>{anime.pointsLength} spots</Text>
        </View>

        {inCollection ? (
          <View style={styles.collectedBadge}>
            <Ionicons name="checkmark" size={11} color="#000" />
            <Text style={styles.collectedBadgeText}>{collectionLabel || 'In Collection'}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {anime.title}
        </Text>

        {anime.cn ? (
          <Text style={styles.titleCN} numberOfLines={1}>
            {anime.cn}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          {anime.city ? (
            <View style={styles.locationTag}>
              <Ionicons name="location" size={12} color="#A3A3A3" />
              <Text style={styles.locationText}>{anime.city}</Text>
            </View>
          ) : null}
        </View>

        {anime.litePoints && anime.litePoints.length > 0 ? (
          <View style={styles.previewRow}>
            {anime.litePoints.slice(0, 3).map((point, idx) => (
              <View key={point.id} style={styles.previewThumb}>
                <Image
                  source={{ uri: point.image }}
                  style={styles.previewImage}
                  contentFit="cover"
                />
                {idx === 2 && anime.litePoints.length > 3 ? (
                  <View style={styles.moreOverlay}>
                    <Text style={styles.moreText}>+{anime.pointsLength - 3}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#252528',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  cardInCollection: {
    borderWidth: 1.5,
  },
  collectedBadge: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#30D158',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  collectedBadgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  imageContainer: {
    height: 120,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  distanceBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  distanceText: {
    color: '#1B1B1D',
    fontSize: 11,
    fontWeight: '700',
  },
  spotCountBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(27, 27, 29, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  spotCountText: {
    color: '#E3E3E3',
    fontSize: 11,
    fontWeight: '600',
  },
  content: {
    padding: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  titleCN: {
    fontSize: 12,
    color: '#A3A3A3',
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  locationTag: {
    backgroundColor: 'rgba(56, 56, 58, 0.8)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  locationText: {
    fontSize: 11,
    color: '#A3A3A3',
  },
  previewRow: {
    flexDirection: 'row',
    gap: 6,
  },
  previewThumb: {
    width: 48,
    height: 36,
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
});
