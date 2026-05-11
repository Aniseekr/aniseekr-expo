// Layout 4 — "03C — Seasonal (Spotlight Carousel)" from japanwalker.pen.
// Centered hero card with side cards peeking, page-length dot indicator, and
// a "Top of the Season" mini-rail of small poster tiles below.

import { memo, useCallback, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Radius, Shadow, Spacing } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { ThemedText, readableTextOn } from '../../themed';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { formatScore, humanizeStatus, seasonOf } from './shared';
import type { Anime } from '../types';

const CARD_W = 290;
const CARD_H = 360;
const CARD_GAP = 12;
const ITEM_FULL = CARD_W + CARD_GAP;
const MAX_DOTS = 6;

interface SpotlightLayoutProps {
  data: Anime[];
  onSelect?: (anime: Anime) => void;
}

function SpotlightLayoutComponent({ data, onSelect }: SpotlightLayoutProps) {
  const { width: screenW } = useWindowDimensions();
  const { theme } = useTheme();
  const accentFg = readableTextOn(theme.accent);
  const scrollX = useSharedValue(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const sidePadding = Math.max(0, (screenW - CARD_W) / 2);

  const setActiveIndexJS = useCallback((idx: number) => {
    setActiveIndex((prev) => {
      if (prev === idx) return prev;
      hapticsBridge.selection();
      return idx;
    });
  }, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
    onMomentumEnd: (event) => {
      const idx = Math.round(event.contentOffset.x / ITEM_FULL);
      runOnJS(setActiveIndexJS)(idx);
    },
  });

  if (data.length === 0) return <EmptyState />;

  const rail = data.slice(0, 8);

  return (
    <View style={styles.root}>
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={ITEM_FULL}
        snapToAlignment="start"
        contentContainerStyle={{
          paddingHorizontal: sidePadding,
          alignItems: 'center',
        }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}>
        {data.map((anime, index) => (
          <SpotlightCard
            key={anime.id}
            anime={anime}
            index={index}
            scrollX={scrollX}
            accent={theme.accent}
            accentFg={accentFg}
            borderColor={theme.glassBorder}
            onPress={() => onSelect?.(anime)}
          />
        ))}
      </Animated.ScrollView>

      <Dots
        length={Math.min(data.length, MAX_DOTS)}
        activeIndex={Math.min(activeIndex, MAX_DOTS - 1)}
        accent={theme.accent}
        idle={theme.text.tertiary}
      />

      <View style={styles.bottomRail}>
        <View style={styles.railHead}>
          <View style={styles.railHeadLeft}>
            <Ionicons name="flame" size={14} color={theme.accent} />
            <ThemedText variant="titleMedium" weight="700">
              Top of the Season
            </ThemedText>
          </View>
          <View style={styles.seeAll}>
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: theme.accent }}>
              See all
            </ThemedText>
            <Ionicons name="chevron-forward" size={11} color={theme.accent} />
          </View>
        </View>
        <Animated.ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.railList}>
          {rail.map((anime) => (
            <MiniPoster
              key={`mini-${anime.id}`}
              anime={anime}
              onPress={() => onSelect?.(anime)}
              accent={theme.accent}
              borderColor={theme.glassBorder}
            />
          ))}
        </Animated.ScrollView>
      </View>
    </View>
  );
}

interface SpotlightCardProps {
  anime: Anime;
  index: number;
  scrollX: SharedValue<number>;
  accent: string;
  accentFg: string;
  borderColor: string;
  onPress: () => void;
}

const SpotlightCard = memo(function SpotlightCard({
  anime,
  index,
  scrollX,
  accent,
  accentFg,
  borderColor,
  onPress,
}: SpotlightCardProps) {
  const inputRange = [
    (index - 1) * ITEM_FULL,
    index * ITEM_FULL,
    (index + 1) * ITEM_FULL,
  ];

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      scrollX.value,
      inputRange,
      [0.84, 1, 0.84],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [0.5, 1, 0.5],
      Extrapolation.CLAMP,
    );
    return { transform: [{ scale }], opacity };
  });

  const season = seasonOf(anime);
  const score = formatScore(anime.score);
  const status = humanizeStatus(anime.status);
  const genres = (anime.tags?.slice(0, 3) ?? []).filter(Boolean);

  return (
    <Animated.View style={[styles.cardWrap, animatedStyle]}>
      <Pressable
        onPress={onPress}
        style={[styles.card, { borderColor }]}
        accessibilityRole="button"
        accessibilityLabel={anime.title}>
        <Image
          source={{ uri: anime.bannerImage ?? anime.image }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={220}
          cachePolicy="memory-disk"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.8)', 'rgba(0,0,0,1)']}
          locations={[0.25, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.cardTop}>
          {season ? (
            <View
              style={[styles.seasonPill, { backgroundColor: `${accent}33` }]}>
              <ThemedText
                variant="captionSmall"
                weight="700"
                style={{ color: accent, letterSpacing: 1.2 }}>
                {season}
              </ThemedText>
            </View>
          ) : null}
        </View>

        <View style={styles.cardBottom}>
          <View style={styles.metaRow}>
            {score ? (
              <View style={styles.metaPart}>
                <Ionicons name="star" size={11} color={accent} />
                <ThemedText
                  variant="captionSmall"
                  weight="700"
                  style={{ color: accent }}>
                  {score}
                </ThemedText>
              </View>
            ) : null}
            {anime.episodes ? (
              <ThemedText variant="captionSmall" tone="secondary" weight="600">
                · {anime.episodes} eps
              </ThemedText>
            ) : null}
            {status ? (
              <ThemedText variant="captionSmall" tone="secondary" weight="600">
                · {status}
              </ThemedText>
            ) : null}
          </View>
          <ThemedText variant="headlineSmall" weight="800" numberOfLines={2}>
            {anime.title}
          </ThemedText>
          {genres.length > 0 ? (
            <View style={styles.tagRow}>
              {genres.map((g) => (
                <View
                  key={g}
                  style={[
                    styles.tag,
                    {
                      backgroundColor: `${accent}26`,
                      borderColor: `${accent}55`,
                    },
                  ]}>
                  <ThemedText
                    variant="captionSmall"
                    weight="600"
                    style={{ color: accent }}>
                    {g}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : null}
          <View style={[styles.cta, { backgroundColor: accent }]}>
            <Ionicons name="play" size={14} color={accentFg} />
            <ThemedText
              variant="bodySmall"
              weight="700"
              style={{ color: accentFg }}>
              Watch Now
            </ThemedText>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
});

interface DotsProps {
  length: number;
  activeIndex: number;
  accent: string;
  idle: string;
}

const Dots = memo(function Dots({ length, activeIndex, accent, idle }: DotsProps) {
  if (length <= 1) return null;
  return (
    <View style={styles.dots}>
      {Array.from({ length }, (_, i) => {
        const active = i === activeIndex;
        return (
          <View
            key={i}
            style={[
              active ? styles.dotActive : styles.dot,
              { backgroundColor: active ? accent : idle },
            ]}
          />
        );
      })}
    </View>
  );
});

interface MiniPosterProps {
  anime: Anime;
  onPress: () => void;
  accent: string;
  borderColor: string;
}

const MiniPoster = memo(function MiniPoster({
  anime,
  onPress,
  accent,
  borderColor,
}: MiniPosterProps) {
  const score = formatScore(anime.score);
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => {
        hapticsBridge.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.miniCell, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={anime.title}>
      <View
        style={[
          styles.miniImage,
          { borderColor, backgroundColor: theme.background.tertiary },
        ]}>
        <Image
          source={{ uri: anime.image }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.87)']}
          locations={[0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        {score ? (
          <View
            style={[
              styles.miniScore,
              { backgroundColor: 'rgba(10,10,10,0.7)' },
            ]}>
            <Ionicons name="star" size={9} color={accent} />
            <ThemedText variant="captionSmall" weight="700">
              {score}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <ThemedText variant="captionSmall" weight="600" numberOfLines={2}>
        {anime.title}
      </ThemedText>
    </Pressable>
  );
});

function EmptyState() {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.empty,
        { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
      ]}>
      <ThemedText variant="bodyMedium" tone="secondary">
        Loading this season…
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 16,
    alignItems: 'center',
  },
  cardWrap: {
    width: CARD_W,
    marginRight: CARD_GAP,
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'space-between',
    ...Shadow.medium,
  },
  cardTop: {
    padding: Spacing.md,
    flexDirection: 'row',
  },
  seasonPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
  },
  cardBottom: {
    padding: Spacing.md + 2,
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaPart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  tagRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: 22,
    marginTop: 4,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 22,
    height: 6,
    borderRadius: 3,
  },
  bottomRail: {
    width: '100%',
    gap: 12,
  },
  railHead: {
    paddingHorizontal: Spacing.lg + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  railHeadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  railList: {
    paddingHorizontal: Spacing.lg + 4,
    gap: 12,
  },
  miniCell: {
    width: 78,
    gap: 6,
  },
  miniImage: {
    width: 78,
    height: 106,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  miniScore: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    height: 18,
    borderRadius: 9,
  },
  empty: {
    height: CARD_H,
    width: CARD_W,
    borderRadius: Radius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const SpotlightLayout = memo(SpotlightLayoutComponent);
