// Horizontal carousel with iOS-style parallax: focused card is full size,
// neighbors scale to ~0.9 and fade slightly. Snap-aligned to card center.

import { memo, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { Radius } from '../../constants/DesignSystem';
import { ShimmerEffect } from '../common/ShimmerEffect';
import { GenreCard } from './GenreCard';
import { Genre } from './types';

type Props = {
  data: Genre[];
  onSelect?: (genre: Genre) => void;
  onPreview?: (genre: Genre) => void;
};

// Focused card ≈ 70% of screen width so the previous/next cards peek
// in clearly on both sides after the 0.88 neighbour scale (~12% per side
// visible — roughly a 1:7:1 visual split). Aspect 16:9 portrait makes the
// card tall and presence-heavy like an anime poster.
const CARD_RATIO = 0.7;
const CARD_ASPECT = 16 / 9;
// Wider gap so the side cards don't look glued to the focused one.
const SPACING = 14;
// Neighbour scale (focused card stays at 1). Lower = side cards shrink
// more, making the focused card feel relatively bigger.
const NEIGHBOUR_SCALE = 0.82;
const NEIGHBOUR_OPACITY = 0.6;
// Smaller reserve = taller card. Just enough for the header/pill bar above
// and the floating tab bar below.
const VERTICAL_RESERVE = 230;
// Vertical breathing room inside the scroll content — named so the loading
// skeleton can reserve the identical space.
const CARD_VPADDING = 16;

// Shared sizing for the carousel and its loading skeleton, so both render cards
// at identical dimensions — the skeleton → data swap then shifts no layout.
function useGenreCarouselMetrics() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cardWidth = Math.min(screenWidth * CARD_RATIO, 340);
  const maxByViewport = Math.max(
    340,
    screenHeight - insets.top - insets.bottom - VERTICAL_RESERVE,
  );
  const cardHeight = Math.min(cardWidth * CARD_ASPECT, maxByViewport);
  return {
    cardWidth,
    cardHeight,
    itemFullWidth: cardWidth + SPACING,
    sidePadding: (screenWidth - cardWidth) / 2,
    // Mirrors the carousel ScrollView frame below, so the skeleton reserves the
    // exact same vertical space.
    containerMinHeight: cardHeight + 60,
  };
}

function GenreCarouselComponent({ data, onSelect, onPreview }: Props) {
  const { cardWidth, cardHeight, itemFullWidth, sidePadding, containerMinHeight } =
    useGenreCarouselMetrics();

  const scrollX = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const renderItem = useMemo(
    () =>
      function Render(genre: Genre, index: number) {
        return (
          <GenreCarouselItem
            key={genre.id}
            genre={genre}
            index={index}
            scrollX={scrollX}
            itemFullWidth={itemFullWidth}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
            spacing={SPACING}
            onSelect={onSelect}
            onPreview={onPreview}
          />
        );
      },
    [scrollX, itemFullWidth, cardWidth, cardHeight, onSelect, onPreview]
  );

  return (
    <Animated.ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={itemFullWidth}
      snapToAlignment="start"
      contentContainerStyle={{
        paddingHorizontal: sidePadding,
        paddingVertical: CARD_VPADDING,
        alignItems: 'center',
      }}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      style={{ minHeight: containerMinHeight }}>
      {data.map((g, i) => renderItem(g, i))}
    </Animated.ScrollView>
  );
}

interface GenreCarouselItemProps {
  genre: Genre;
  index: number;
  scrollX: SharedValue<number>;
  itemFullWidth: number;
  cardWidth: number;
  cardHeight: number;
  spacing: number;
  onSelect?: (g: Genre) => void;
  onPreview?: (g: Genre) => void;
}

const GenreCarouselItem = memo(function GenreCarouselItem({
  genre,
  index,
  scrollX,
  itemFullWidth,
  cardWidth,
  cardHeight,
  spacing,
  onSelect,
  onPreview,
}: GenreCarouselItemProps) {
  const inputRange = [
    (index - 1) * itemFullWidth,
    index * itemFullWidth,
    (index + 1) * itemFullWidth,
  ];

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      scrollX.value,
      inputRange,
      [NEIGHBOUR_SCALE, 1, NEIGHBOUR_SCALE],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [NEIGHBOUR_OPACITY, 1, NEIGHBOUR_OPACITY],
      Extrapolation.CLAMP,
    );
    return { transform: [{ scale }], opacity };
  });

  return (
    <Animated.View style={[{ width: cardWidth, marginRight: spacing }, animatedStyle]}>
      <View style={{ alignItems: 'center' }}>
        <GenreCard
          title={genre.displayName}
          image={genre.image}
          genreId={genre.id}
          onPressIn={() => onPreview?.(genre)}
          onPress={() => onSelect?.(genre)}
          width={cardWidth}
          height={cardHeight}
          showButton
        />
      </View>
    </Animated.View>
  );
});

export const GenreCarousel = memo(GenreCarouselComponent);

// Loading placeholder for the discovery carousel. Renders the focused +
// peeking-neighbour silhouette at the exact card size GenreCarousel uses (via
// useGenreCarouselMetrics), so the skeleton → data swap shifts no layout. Kept
// as a flat, non-scrolling View tree — it lives for ms-to-seconds, and all
// shimmer animation cost is shared through ShimmerEffect's single global driver.
function GenreCarouselSkeletonComponent() {
  const { cardWidth, cardHeight, containerMinHeight } = useGenreCarouselMetrics();

  return (
    <View style={[styles.skeletonWrap, { minHeight: containerMinHeight }]}>
      <View style={styles.skeletonRow}>
        <ShimmerEffect
          width={cardWidth * NEIGHBOUR_SCALE}
          height={cardHeight * NEIGHBOUR_SCALE}
          borderRadius={Radius.xxl}
          intensity="low"
          style={styles.skeletonNeighbour}
        />
        <ShimmerEffect
          width={cardWidth}
          height={cardHeight}
          borderRadius={Radius.xxl}
          intensity="low"
        />
        <ShimmerEffect
          width={cardWidth * NEIGHBOUR_SCALE}
          height={cardHeight * NEIGHBOUR_SCALE}
          borderRadius={Radius.xxl}
          intensity="low"
          style={styles.skeletonNeighbour}
        />
      </View>
    </View>
  );
}
export const GenreCarouselSkeleton = memo(GenreCarouselSkeletonComponent);

const styles = StyleSheet.create({
  skeletonWrap: {
    paddingVertical: CARD_VPADDING,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING,
    // The 3 cards are wider than the screen; centring + clipping reproduces the
    // carousel's "focused card centred, neighbours peeking from both edges" look.
    overflow: 'hidden',
  },
  // Side cards sit at the carousel's resting parallax opacity so they read as
  // the same faded peeking neighbours the real carousel shows.
  skeletonNeighbour: {
    opacity: NEIGHBOUR_OPACITY,
  },
});
