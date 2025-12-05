import { Image } from "expo-image";
import { memo } from "react";
import { Pressable, Text, View, Platform, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

type Props = {
  title: string;
  image: string;
  genreId?: string;
  onPress?: () => void;
  showButton?: boolean;
};

function GenreCardComponent({ title, image, genreId, onPress, showButton = true }: Props) {
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
    <Pressable onPress={handlePress} style={styles.card}>
      <View style={styles.imageContainer}>
        {image && image.trim() !== "" ? (
          <Image
            source={{ uri: image }}
            style={styles.image}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={styles.placeholder}>
            <MaterialIcons name="image" size={48} color="rgba(255,255,255,0.3)" />
          </View>
        )}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          style={styles.gradient}
        />
        {showButton && (
          <View style={styles.content}>
            <Text style={styles.title}>{title}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 288,
    height: 420,
    marginHorizontal: 8,
    borderRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      android: {
        elevation: 4,
      },
    }),
  },
  imageContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '40%',
  },
  content: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
});

export const GenreCard = memo(GenreCardComponent);

