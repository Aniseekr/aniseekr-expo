import { Image } from "expo-image";
import { memo } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutDown } from "react-native-reanimated";
import { AIRecommendation } from "./types";

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
          className="mt-auto bg-card-surface border-t border-card-border rounded-t-3xl p-5"
        >
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-white text-lg font-semibold">AI Recommendation</Text>
            <Pressable onPress={onClose} className="px-3 py-1 rounded-full bg-white/10">
              <Text className="text-white text-xs">Close</Text>
            </Pressable>
          </View>
          {data.loading ? (
            <View className="py-6 items-center">
              <Text className="text-white/80">Thinking...</Text>
            </View>
          ) : data.anime ? (
            <Pressable
              onPress={onSelect}
              className="flex-row gap-3 rounded-2xl overflow-hidden border border-card-border bg-card-surface"
            >
              <Image
                source={{ uri: data.anime.image }}
                className="w-28 h-40 bg-black/20"
                contentFit="cover"
                transition={150}
              />
              <View className="flex-1 justify-center pr-3">
                <Text className="text-white text-lg font-semibold" numberOfLines={2}>
                  {data.anime.title}
                </Text>
                <Text className="text-white/70 text-xs mt-2" numberOfLines={3}>
                  Tailored using your recent ratings and mood picks.
                </Text>
              </View>
            </Pressable>
          ) : (
            <View className="py-6 items-center">
              <Text className="text-white/80">Pull down to ask AI for a pick.</Text>
            </View>
          )}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

export const AIRecommendationSheet = memo(AIRecommendationSheetComponent);

