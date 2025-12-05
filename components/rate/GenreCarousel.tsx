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
            onPress={() => onSelect?.(item)}
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
      contentContainerStyle={{ paddingHorizontal: 18 }}
      ItemSeparatorComponent={() => <View className="w-1" />}
      snapToInterval={304}
      decelerationRate={0.998}
      scrollEventThrottle={16}
    />
  );
}

