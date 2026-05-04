// Horizontal carousel with iOS-style parallax: focused card is full size,
// neighbors scale to ~0.9 and fade slightly. Snap-aligned to card center.

import { memo, useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { GenreCard } from './GenreCard';
import { Genre } from './types';

type Props = {
  data: Genre[];
  onSelect?: (genre: Genre) => void;
};

const CARD_RATIO = 0.7;
const CARD_HEIGHT_RATIO = CARD_RATIO * (16 / 9);
const SPACING = 12;

function GenreCarouselComponent({ data, onSelect }: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const cardWidth = Math.min(screenWidth * CARD_RATIO, 320);
  const cardHeight = Math.min(cardWidth * (16 / 9), screenHeight * 0.62);
  const itemFullWidth = cardWidth + SPACING;
  const sidePadding = (screenWidth - cardWidth) / 2;

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
          />
        );
      },
    [scrollX, itemFullWidth, cardWidth, cardHeight, onSelect]
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
        paddingVertical: 16,
        alignItems: 'center',
      }}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      style={{ minHeight: cardHeight + 60 }}>
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
}: GenreCarouselItemProps) {
  const inputRange = [
    (index - 1) * itemFullWidth,
    index * itemFullWidth,
    (index + 1) * itemFullWidth,
  ];

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(scrollX.value, inputRange, [0.88, 1, 0.88], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0.55, 1, 0.55], Extrapolation.CLAMP);
    return { transform: [{ scale }], opacity };
  });

  return (
    <Animated.View style={[{ width: cardWidth, marginRight: spacing }, animatedStyle]}>
      <View style={{ alignItems: 'center' }}>
        <GenreCard
          title={genre.displayName}
          image={genre.image}
          genreId={genre.id}
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
