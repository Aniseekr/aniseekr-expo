// iOS-style focus-day carousel.
// The active day takes ~88% of screen width; neighbor cards peek at the edges.
// Off-center cards scale to 0.94 + fade and shift slightly downward.

import { memo, useEffect, useMemo, useRef } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Anime } from '../rate/types';
import { NearbyPilgrimageBadge } from '../pilgrimage/NearbyPilgrimageBadge';
import { Colors, FontFamily, Radius, Spacing, Typography } from '../../constants/DesignSystem';

export interface DailyAnime {
  day: string;
  anime: Anime[];
}

interface FocusDayCarouselProps {
  weekDays: string[];
  groupedAnime: DailyAnime[];
  showUnknownDays?: boolean;
  isCurrentDay: (day: string) => boolean;
  initialDay?: string;
  /**
   * Opaque key. When this changes the carousel resets user-interaction state
   * and re-snaps to {@link initialDay}. Parent passes a string composed of
   * the season/year/filter combo so a hard reset is implied.
   */
  scrollToTodayKey?: string | number;
  /** Optional browse-source platform — used by the inline pilgrimage badge. */
  sourcePlatform?: string;
}

const CARD_WIDTH_RATIO = 0.88;
const SPACING = 16;

function dayFullName(day: string): string {
  if (day === 'Unknown') return 'Unknown Air Date';
  if (day.endsWith('s')) return day.slice(0, -1);
  return day;
}

function FocusDayCarouselComponent({
  weekDays,
  groupedAnime,
  showUnknownDays = false,
  isCurrentDay,
  initialDay,
  scrollToTodayKey,
  sourcePlatform,
}: FocusDayCarouselProps) {
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth * CARD_WIDTH_RATIO;
  const itemFullWidth = cardWidth + SPACING;
  const sidePadding = (screenWidth - cardWidth) / 2;

  const displayDays = useMemo(() => {
    const list = [...weekDays];
    const hasUnknown = groupedAnime.some((d) => d.day === 'Unknown' && d.anime.length > 0);
    if (hasUnknown && showUnknownDays && !list.includes('Unknown')) {
      list.push('Unknown');
    }
    return list;
  }, [weekDays, groupedAnime, showUnknownDays]);

  const scrollX = useSharedValue(0);
  const scrollRef = useRef<Animated.ScrollView>(null);
  const userInteractedRef = useRef(false);

  const initialIndex = useMemo(() => {
    if (!initialDay) return 0;
    const idx = displayDays.indexOf(initialDay);
    return idx >= 0 ? idx : 0;
  }, [displayDays, initialDay]);

  // Snap to the initial day on mount.
  useEffect(() => {
    if (!scrollRef.current) return;
    const x = initialIndex * itemFullWidth;
    scrollX.value = x;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x, animated: false });
    });
  }, [initialIndex, itemFullWidth, scrollX]);

  // Hard reset: when the parent flips scrollToTodayKey, re-snap to initialDay
  // and clear the user-interaction flag.
  useEffect(() => {
    if (scrollToTodayKey === undefined) return;
    userInteractedRef.current = false;
    const x = initialIndex * itemFullWidth;
    scrollX.value = x;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x, animated: true });
    });
  }, [scrollToTodayKey, initialIndex, itemFullWidth, scrollX]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const handleScrollEndDrag = () => {
    userInteractedRef.current = true;
  };

  return (
    <Animated.ScrollView
      ref={scrollRef}
      horizontal
      pagingEnabled={false}
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={itemFullWidth}
      snapToAlignment="start"
      contentContainerStyle={{
        paddingHorizontal: sidePadding,
        paddingVertical: Spacing.md,
      }}
      onScroll={scrollHandler}
      onScrollEndDrag={handleScrollEndDrag}
      scrollEventThrottle={16}>
      {displayDays.map((day, index) => {
        const dayData = groupedAnime.find((g) => g.day === day) ?? { day, anime: [] };
        const isToday = isCurrentDay(day);
        return (
          <FocusDayItem
            key={day}
            day={day}
            dayData={dayData}
            index={index}
            scrollX={scrollX}
            itemFullWidth={itemFullWidth}
            cardWidth={cardWidth}
            isToday={isToday}
            spacing={SPACING}
            sourcePlatform={sourcePlatform}
          />
        );
      })}
    </Animated.ScrollView>
  );
}

interface FocusDayItemProps {
  day: string;
  dayData: DailyAnime;
  index: number;
  scrollX: SharedValue<number>;
  itemFullWidth: number;
  cardWidth: number;
  isToday: boolean;
  spacing: number;
  sourcePlatform?: string;
}

const FocusDayItem = memo(function FocusDayItem({
  day,
  dayData,
  index,
  scrollX,
  itemFullWidth,
  cardWidth,
  isToday,
  spacing,
  sourcePlatform,
}: FocusDayItemProps) {
  const router = useRouter();
  const inputRange = [
    (index - 1) * itemFullWidth,
    index * itemFullWidth,
    (index + 1) * itemFullWidth,
  ];

  const cardStyle = useAnimatedStyle(() => {
    const scale = interpolate(scrollX.value, inputRange, [0.94, 1, 0.94], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0.55, 1, 0.55], Extrapolation.CLAMP);
    const translateY = interpolate(scrollX.value, inputRange, [10, 0, 10], Extrapolation.CLAMP);
    return {
      transform: [{ scale }, { translateY }],
      opacity,
    };
  });

  const previewAnime = dayData.anime.slice(0, 4);

  return (
    <Animated.View
      style={[styles.cardWrapper, { width: cardWidth, marginRight: spacing }, cardStyle]}>
      <View style={[styles.card, isToday ? styles.cardToday : styles.cardDefault]}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={28} tint="systemThickMaterialDark" style={StyleSheet.absoluteFill} />
        ) : null}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: isToday ? Colors.glass.heavy : Colors.glass.medium },
          ]}
        />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.dayTitle}>{dayFullName(day)}</Text>
            {isToday ? <View style={styles.todayDot} /> : null}
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{dayData.anime.length} shows</Text>
          </View>
        </View>

        {/* Anime stack */}
        <View style={styles.body}>
          {dayData.anime.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="tv-outline" size={36} color={Colors.text.tertiary} />
              <Text style={styles.emptyText}>No anime scheduled</Text>
            </View>
          ) : (
            previewAnime.map((anime) => (
              <Pressable
                key={anime.id}
                onPress={() => router.push(`/(rate)/anime/${anime.id}`)}
                style={styles.row}>
                {isToday ? <View style={styles.trackedBar} /> : null}
                <Image source={{ uri: anime.image }} style={styles.poster} resizeMode="cover" />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {anime.title}
                  </Text>
                  <View style={styles.metaRow}>
                    {anime.score ? (
                      <View style={styles.scorePill}>
                        <Ionicons name="star" size={10} color={Colors.warning} />
                        <Text style={styles.scoreText}>{anime.score}</Text>
                      </View>
                    ) : null}
                    {anime.format || anime.type ? (
                      <Text style={styles.metaText}>{anime.format ?? anime.type}</Text>
                    ) : null}
                    {sourcePlatform ? (
                      <NearbyPilgrimageBadge
                        sourcePlatform={sourcePlatform}
                        id={anime.id}
                        variant="icon"
                      />
                    ) : null}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={14} color={Colors.text.tertiary} />
              </Pressable>
            ))
          )}
          {dayData.anime.length > previewAnime.length ? (
            <View style={styles.moreFooter}>
              <Text style={styles.moreText}>
                +{dayData.anime.length - previewAnime.length} more
              </Text>
            </View>
          ) : null}
        </View>

        {/* Bottom gradient */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.45)']}
          style={styles.bottomFade}
          pointerEvents="none"
        />
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  cardWrapper: {
    height: '100%',
  },
  card: {
    flex: 1,
    borderRadius: Radius.xxl,
    overflow: 'hidden',
    borderWidth: 1.5,
  },
  cardDefault: {
    borderColor: Colors.glass.border,
    backgroundColor: Colors.background.secondary,
  },
  cardToday: {
    borderColor: Colors.primary,
    backgroundColor: Colors.background.secondary,
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 18,
      },
      android: { elevation: 6 },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  dayTitle: {
    ...Typography.headlineLarge,
    color: Colors.text.primary,
    fontFamily: FontFamily.rounded,
  },
  todayDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
    marginTop: 4,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.chip,
    backgroundColor: Colors.glass.medium,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  countText: {
    ...Typography.captionSmall,
    color: Colors.text.secondary,
    fontFamily: FontFamily.text,
  },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.lg,
    gap: Spacing.xs,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  emptyText: {
    ...Typography.bodySmall,
    color: Colors.text.tertiary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
    gap: Spacing.sm,
  },
  trackedBar: {
    width: 3,
    height: 56,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  poster: {
    width: 52,
    height: 74,
    borderRadius: Radius.sm,
    backgroundColor: Colors.background.tertiary,
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    ...Typography.titleMedium,
    color: Colors.text.primary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: Colors.glass.light,
  },
  scoreText: {
    ...Typography.captionSmall,
    color: Colors.warning,
  },
  metaText: {
    ...Typography.captionSmall,
    color: Colors.text.secondary,
  },
  moreFooter: {
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  moreText: {
    ...Typography.captionSmall,
    color: Colors.text.tertiary,
  },
  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 40,
  },
});

export const FocusDayCarousel = memo(FocusDayCarouselComponent);
