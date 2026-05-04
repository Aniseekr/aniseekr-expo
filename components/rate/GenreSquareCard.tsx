import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, Text, View, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

type Props = {
  title: string;
  image: string;
  genreId?: string;
  onPress?: () => void;
};

const CARD_SIZE = 140;

function GenreSquareCardComponent({ title, image, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.imageContainer}>
        {image && image.trim() !== '' ? (
          <Image
            source={{ uri: image }}
            style={styles.image}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={styles.placeholder}>
            {/* Subtle gradient or solid color, no icon to avoid "swirl" look */}
            <LinearGradient colors={['#27272a', '#18181b']} style={StyleSheet.absoluteFill} />
          </View>
        )}

        {/* Full overlay for better text contrast since text is centered */}
        <View style={styles.overlay} />

        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    marginRight: 12,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      android: {
        elevation: 3,
      },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
    }),
  },
  imageContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
    backgroundColor: '#1E1E1E',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)', // Darken whole image
  },
  content: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
});

export const GenreSquareCard = memo(GenreSquareCardComponent);
