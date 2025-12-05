import { Image } from "expo-image";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { GlassCard } from "../common/GlassCard";

type Props = {
  title: string;
  image: string;
  genreId?: string;
  onPress?: () => void;
};

function GenreCardComponent({ title, image, genreId, onPress }: Props) {
  const router = useRouter();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push({
        pathname: "/(rate)/rating",
        params: { genreId: genreId || title.toLowerCase(), genreName: title },
      });
    }
  };

  return (
    <Pressable onPress={handlePress} className="w-72 h-[420px] mx-2">
      <GlassCard className="flex-1" style={{ overflow: 'hidden' }}>
        {image && image.trim() !== "" ? (
          <Image
            source={{ uri: image }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
          />
        ) : null}
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

