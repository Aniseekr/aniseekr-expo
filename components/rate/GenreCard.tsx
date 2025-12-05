import { Image } from "expo-image";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { GlassCard } from "../common/GlassCard";

type Props = {
  title: string;
  image: string;
  onPress?: () => void;
};

function GenreCardComponent({ title, image, onPress }: Props) {
  return (
    <Pressable onPress={onPress} className="w-72 h-[420px] mx-2">
      <GlassCard className="flex-1 overflow-hidden">
      <Image
        source={{ uri: image }}
        className="flex-1"
        contentFit="cover"
        transition={150}
      />
      <View className="absolute bottom-4 left-4 right-4">
        <View className="bg-black/50 px-4 py-3 rounded-xl">
          <Text className="text-white text-xl font-semibold">{title}</Text>
          <Text className="text-white/80 text-xs mt-1">Tap to start rating</Text>
        </View>
      </View>
      </GlassCard>
    </Pressable>
  );
}

export const GenreCard = memo(GenreCardComponent);

