import { useCallback, useMemo } from "react";
import { FlatList, View } from "react-native";
import { GenreCard } from "./GenreCard";
import { Genre } from "./types";

type Props = {
  data: Genre[];
  onSelect?: (genre: Genre) => void;
};

export function GenreCarousel({ data, onSelect }: Props) {
  const renderItem = useCallback(
    ({ item }: { item: Genre }) => {
      return (
        <View className="items-center">
          <GenreCard
            title={item.displayName}
            image={item.image}
            genreId={item.id}
            onPress={() => onSelect?.(item)}
            showButton={false}
          />
        </View>
      );
    },
    [onSelect]
  );

  const itemLayout = useCallback(
    (_: unknown, index: number) => ({
      index,
      length: 304,
      offset: index * 304,
    }),
    []
  );

  const keyExtractor = useMemo(() => (item: Genre) => item.id, []);

  return (
    <FlatList
      horizontal
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemLayout={itemLayout}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 8 }}
      ItemSeparatorComponent={() => <View style={{ width: 16 }} />}
      snapToInterval={304}
      snapToAlignment="center"
      decelerationRate="fast"
      scrollEventThrottle={16}
      pagingEnabled={false}
      style={{ minHeight: 450 }}
    />
  );
}

