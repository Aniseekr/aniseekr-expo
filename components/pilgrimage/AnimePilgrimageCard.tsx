// Ported from japanwalker/components/AnimePilgrimageCard.tsx, then made
// theme-aware: surface / text / collected-state colours now come from
// useTheme(); the per-anime brand colour (anime.color) still drives the
// region badge, gradient tint and distance badge.

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { readableTextOn } from '../themed/contrast';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { Shadow } from '../../constants/DesignSystem';
import { cityToColor } from '../../libs/services/pilgrimage/region-color';
import {
  formatPilgrimageSubtitle,
  getPilgrimageAnimeTitles,
} from '../../libs/services/pilgrimage/pilgrimage-localization';
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

const styleCache = new WeakMap<ThemePalette, ReturnType<typeof makeStyles>>();

function getStyles(theme: ThemePalette): ReturnType<typeof makeStyles> {
  const cached = styleCache.get(theme);
  if (cached) return cached;
  const styles = makeStyles(theme);
  styleCache.set(theme, styles);
  return styles;
}

const formatDistance = (km: number): string => {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
};

export function AnimePilgrimageCard({
  anime,
  distance,
  inCollection,
  collectionLabel,
  onPress,
}: AnimePilgrimageCardProps) {
  const { theme } = useTheme();
  const styles = getStyles(theme);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.(anime);
  };

  // The per-anime brand colour drives the region/distance accents; fall back to
  // the app accent when the source payload has no colour.
  const themeColor = anime.color || theme.accent;
  const regionColor = anime.city ? cityToColor(anime.city, themeColor) : themeColor;
  const regionFg = readableTextOn(regionColor);
  const distanceFg = readableTextOn(themeColor);
  const successFg = readableTextOn(theme.status.success);
  const titles = getPilgrimageAnimeTitles(anime);
  const subtitle = formatPilgrimageSubtitle(titles);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
        { borderColor: inCollection ? theme.status.success : `${themeColor}30` },
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
          colors={['transparent', `${themeColor}40`, theme.background.secondary]}
          style={styles.imageGradient}
        />

        <View style={styles.topLeftStack} pointerEvents="none">
          {anime.city ? (
            <View
              style={[
                styles.regionBadge,
                { backgroundColor: regionColor, borderColor: `${regionFg}33` },
              ]}>
              <Ionicons name="location-sharp" size={11} color={regionFg} />
              <Text style={[styles.regionText, { color: regionFg }]} numberOfLines={1}>
                {anime.city}
              </Text>
            </View>
          ) : null}
          {distance !== undefined ? (
            <View style={[styles.distanceBadge, { backgroundColor: `${themeColor}E0` }]}>
              <Text style={[styles.distanceText, { color: distanceFg }]}>
                {formatDistance(distance)}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.spotCountBadge}>
          <Text style={styles.spotCountText}>{anime.pointsLength} spots</Text>
        </View>

        {inCollection ? (
          <View style={styles.collectedBadge}>
            <Ionicons name="checkmark" size={11} color={successFg} />
            <Text style={[styles.collectedBadgeText, { color: successFg }]}>
              {collectionLabel || 'In Collection'}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {titles.primary}
        </Text>

        {subtitle ? (
          <Text style={styles.titleCN} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}

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

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.background.secondary,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      ...Shadow.medium,
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
      backgroundColor: theme.status.success,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    collectedBadgeText: {
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
    topLeftStack: {
      position: 'absolute',
      top: 10,
      left: 10,
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 6,
      maxWidth: '70%',
    },
    regionBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      ...Shadow.subtle,
    },
    regionText: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.2,
      maxWidth: 140,
    },
    distanceBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    distanceText: {
      fontSize: 11,
      fontWeight: '700',
    },
    spotCountBadge: {
      position: 'absolute',
      top: 10,
      right: 10,
      backgroundColor: theme.background.secondary,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    spotCountText: {
      color: theme.text.primary,
      fontSize: 11,
      fontWeight: '600',
    },
    content: {
      padding: 12,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.text.primary,
      marginBottom: 2,
    },
    titleCN: {
      fontSize: 12,
      color: theme.text.secondary,
      marginBottom: 12,
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
      // Scrim darkening the thumbnail behind the "+N" count — a photo
      // darkener, not a theme surface, so it stays a fixed black wash.
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    moreText: {
      color: theme.text.primary,
      fontSize: 11,
      fontWeight: '600',
    },
  });
}
