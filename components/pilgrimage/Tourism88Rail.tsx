// Horizontal rail for the Japanese Anime Tourism 88 selection on the
// pilgrimage hub. Sorted by AniList popularity descending; multi-city anime
// collapse to one card with a "+N cities" tag.

import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { Spacing, Radius, Shadow, Typography } from '../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { ThemedText } from '../themed';
import type {
  AnimeTourism88Region,
  UniqueAnime88Entry,
} from '../../libs/services/pilgrimage/anime88-repository';

// Eighty-eight selection mark colour — picked for "official certification"
// connotation (vs. theme.accent which can drift between user themes).
export const OFFICIAL_88_GOLD = '#D4AF37';

const REGION_LABELS: Record<AnimeTourism88Region, string> = {
  hokkaido_tohoku: '北海道・東北',
  kanto: '関東',
  tokyo: '東京',
  chubu: '中部',
  kinki: '近畿',
  chugoku_shikoku: '中国・四国',
  kyushu_okinawa: '九州・沖縄',
};

export interface Tourism88RailProps {
  entries: readonly UniqueAnime88Entry[];
  /** Bangumi ids the user already has in their collection. */
  collectionBangumiIds: ReadonlySet<number>;
  /** bangumiId → cover URL (typically resolved from anitabi-index). */
  coversById: ReadonlyMap<number, string>;
  onPressEntry: (entry: UniqueAnime88Entry) => void;
  onSeeAll?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function Tourism88Rail({
  entries,
  collectionBangumiIds,
  coversById,
  onPressEntry,
  onSeeAll,
  style,
}: Tourism88RailProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  if (entries.length === 0) return null;
  return (
    <View style={[styles.section, style]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.officialBadge}>
            <ThemedText
              variant="captionSmall"
              weight="800"
              style={styles.officialBadgeLabel}>
              ★ 公認
            </ThemedText>
          </View>
          <ThemedText variant="titleMedium" weight="700">
            日本のアニメ聖地 88
          </ThemedText>
        </View>
        {onSeeAll ? (
          <Pressable
            onPress={onSeeAll}
            hitSlop={10}
            style={({ pressed }) => [styles.seeAll, pressed && { opacity: 0.6 }]}>
            <ThemedText variant="captionSmall" weight="500" tone="secondary">
              See all
            </ThemedText>
            <Ionicons name="chevron-forward" size={12} color={theme.text.tertiary} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}>
        {entries.map((entry) => (
          <Tourism88RailCard
            key={entry.bangumiId}
            entry={entry}
            inCollection={collectionBangumiIds.has(entry.bangumiId)}
            cover={coversById.get(entry.bangumiId) ?? null}
            onPress={() => onPressEntry(entry)}
            theme={theme}
          />
        ))}
      </ScrollView>
    </View>
  );
}

interface Tourism88RailCardProps {
  entry: UniqueAnime88Entry;
  inCollection: boolean;
  cover: string | null;
  onPress: () => void;
  theme: ThemePalette;
}

function Tourism88RailCard({
  entry,
  inCollection,
  cover,
  onPress,
  theme,
}: Tourism88RailCardProps) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const primaryEntry = entry.locations[0];
  const cityCount = entry.locations.length;
  const regionLabel = REGION_LABELS[primaryEntry.region];
  const title = entry.titleEn || entry.titleJa;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, Anime Tourism 88 entry`}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}>
      <View style={styles.posterWrap}>
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={styles.poster}
            contentFit="cover"
            transition={180}
            cachePolicy="memory-disk"
          />
        ) : (
          <View
            style={[
              styles.poster,
              styles.posterPlaceholder,
              { backgroundColor: theme.background.tertiary },
            ]}>
            <Ionicons name="film-outline" size={24} color={theme.text.tertiary} />
          </View>
        )}
        <View style={styles.idChip}>
          <ThemedText variant="captionSmall" weight="800" style={styles.idChipLabel}>
            ★ #{primaryEntry.id}
          </ThemedText>
        </View>
        {inCollection ? (
          <View style={styles.collectedBadge}>
            <Ionicons name="checkmark" size={11} color="#1c1c1e" />
          </View>
        ) : null}
        {cityCount > 1 ? (
          <View style={styles.cityCount}>
            <ThemedText variant="captionSmall" weight="700" style={styles.cityCountLabel}>
              +{cityCount} cities
            </ThemedText>
          </View>
        ) : null}
      </View>
      <View style={styles.meta}>
        <ThemedText
          variant="captionSmall"
          weight="700"
          numberOfLines={2}
          style={styles.title}>
          {title}
        </ThemedText>
        <ThemedText
          variant="captionSmall"
          tone="tertiary"
          numberOfLines={1}
          style={styles.subtitle}>
          {regionLabel}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    section: {
      marginTop: Spacing.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.screenPadding,
      marginBottom: Spacing.sm,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    officialBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: OFFICIAL_88_GOLD,
    },
    officialBadgeLabel: {
      ...Typography.captionSmall,
      color: '#1c1c1e',
      fontSize: 10,
      letterSpacing: 0.3,
    },
    seeAll: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    rail: {
      paddingHorizontal: Spacing.screenPadding,
      gap: 12,
    },
    card: {
      width: 108,
    },
    posterWrap: {
      width: 108,
      height: 152,
      borderRadius: Radius.md,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: OFFICIAL_88_GOLD,
      backgroundColor: theme.background.secondary,
      ...Shadow.subtle,
    },
    poster: {
      width: '100%',
      height: '100%',
    },
    posterPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    idChip: {
      position: 'absolute',
      top: 6,
      left: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: OFFICIAL_88_GOLD,
    },
    idChipLabel: {
      ...Typography.captionSmall,
      color: '#1c1c1e',
      fontSize: 10,
      letterSpacing: 0.2,
    },
    collectedBadge: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: '#30D158',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: '#1c1c1e',
    },
    cityCount: {
      position: 'absolute',
      bottom: 6,
      right: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: 'rgba(28,28,30,0.85)',
    },
    cityCountLabel: {
      ...Typography.captionSmall,
      color: '#fff',
      fontSize: 9,
    },
    meta: {
      marginTop: 6,
    },
    title: {
      ...Typography.captionSmall,
      color: theme.text.primary,
      fontSize: 12,
      lineHeight: 14,
    },
    subtitle: {
      ...Typography.captionSmall,
      fontSize: 10,
      marginTop: 2,
    },
  });
}
