import { Image } from "expo-image";
import { memo } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { Recommendation } from "./types";
import { GlassCard } from "../common/GlassCard";

type Props = {
  data: Recommendation[];
  onSelect?: (id: string) => void;
  onRefresh?: () => void;
};

function RecommendationItem({ item, onSelect }: { item: Recommendation; onSelect?: (id: string) => void }) {
  return (
    <Pressable onPress={() => onSelect?.(item.id)} className="w-56 mr-3">
      <GlassCard className="overflow-hidden">
      <Image
        source={{ uri: item.anime.image }}
        className="w-full h-64 bg-black/20"
        contentFit="cover"
        transition={120}
      />
      <View className="p-3 gap-1">
        <Text className="text-white font-semibold" numberOfLines={2}>
          {item.anime.title}
        </Text>
        <Text className="text-white/70 text-xs" numberOfLines={2}>
          {item.reason}
        </Text>
      </View>
      </GlassCard>
    </Pressable>
  );
}

function PersonalizedRecommendationComponent({ data, onSelect, onRefresh }: Props) {
  return (
    <View className="gap-3">
      <View className="flex-row justify-between items-center px-1">
        <Text className="text-white text-lg font-semibold">Personalized Picks</Text>
        {onRefresh ? (
          <Pressable onPress={onRefresh} className="px-3 py-1 rounded-full bg-white/10">
            <Text className="text-white text-xs">Refresh</Text>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        horizontal
        data={data}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <RecommendationItem item={item} onSelect={onSelect} />}
        contentContainerStyle={{ paddingHorizontal: 8 }}
      />
    </View>
  );
}

export const PersonalizedRecommendation = memo(PersonalizedRecommendationComponent);

