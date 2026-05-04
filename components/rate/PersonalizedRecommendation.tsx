import { Image } from 'expo-image';
import { memo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Recommendation } from './types';
import { GlassCard } from '../common/GlassCard';

type Props = {
  data: Recommendation[];
  onSelect?: (id: string) => void;
  onRefresh?: () => void;
};

function RecommendationItem({
  item,
  onSelect,
}: {
  item: Recommendation;
  onSelect?: (id: string) => void;
}) {
  const router = useRouter();

  const handlePress = () => {
    if (onSelect) {
      onSelect(item.id);
    } else {
      router.push({
        pathname: '/(rate)/rating',
        params: { animeId: item.anime.id, genreName: item.anime.title },
      });
    }
  };

  return (
    <Pressable onPress={handlePress} className="mr-3 w-56">
      <GlassCard style={{ overflow: 'hidden' }}>
        <Image
          source={{ uri: item.anime.image }}
          style={{ width: '100%', height: 256 }}
          className="bg-black/20"
          contentFit="cover"
          transition={120}
        />
        <View className="gap-1 p-3">
          <Text className="font-semibold text-white" numberOfLines={2}>
            {item.anime.title}
          </Text>
          <Text className="text-xs text-white/70" numberOfLines={2}>
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
      <View className="flex-row items-center justify-between px-1">
        <Text className="text-lg font-semibold text-white">Personalized Picks</Text>
        {onRefresh ? (
          <Pressable onPress={onRefresh} className="rounded-full bg-white/10 px-3 py-1">
            <Text className="text-xs text-white">Refresh</Text>
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
