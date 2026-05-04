import { Image } from 'expo-image';
import { memo } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import { AIRecommendation } from './types';

type Props = {
  visible: boolean;
  data: AIRecommendation;
  onClose: () => void;
  onSelect?: () => void;
};

function AIRecommendationSheetComponent({ visible, data, onClose, onSelect }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/60" onPress={onClose}>
        <Animated.View
          entering={FadeInUp.duration(220)}
          exiting={FadeOutDown.duration(200)}
          className="bg-card-surface border-card-border mt-auto rounded-t-3xl border-t p-5">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-lg font-semibold text-white">AI Recommendation</Text>
            <Pressable onPress={onClose} className="rounded-full bg-white/10 px-3 py-1">
              <Text className="text-xs text-white">Close</Text>
            </Pressable>
          </View>
          {data.loading ? (
            <View className="items-center py-6">
              <Text className="text-white/80">Thinking...</Text>
            </View>
          ) : data.anime ? (
            <Pressable
              onPress={onSelect}
              className="border-card-border bg-card-surface flex-row gap-3 overflow-hidden rounded-2xl border">
              <Image
                source={{ uri: data.anime.image }}
                className="h-40 w-28 bg-black/20"
                contentFit="cover"
                transition={150}
              />
              <View className="flex-1 justify-center pr-3">
                <Text className="text-lg font-semibold text-white" numberOfLines={2}>
                  {data.anime.title}
                </Text>
                <Text className="mt-2 text-xs text-white/70" numberOfLines={3}>
                  Tailored using your recent ratings and mood picks.
                </Text>
              </View>
            </Pressable>
          ) : (
            <View className="items-center py-6">
              <Text className="text-white/80">Pull down to ask AI for a pick.</Text>
            </View>
          )}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

export const AIRecommendationSheet = memo(AIRecommendationSheetComponent);
