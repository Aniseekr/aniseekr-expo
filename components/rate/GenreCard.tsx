// 3:5 portrait genre card (poster-like) matching the iOS GenreCardView aesthetic.
// Image fills the card, gradient fades the bottom, big title + "Tap to Explore" hint.

import { Image } from 'expo-image';
import { memo, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { FontFamily, Radius, Shadow } from '../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';

type Props = {
  title: string;
  image: string;
  genreId?: string;
  onPress?: () => void;
  onPressIn?: () => void;
  showButton?: boolean;
  width?: number;
  height?: number;
};

function GenreCardComponent({
  title,
  image,
  genreId,
  onPress,
  onPressIn,
  showButton = true,
  width,
  height,
}: Props) {
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    router.push({
      pathname: '/(rate)/rating',
      params: { genreId: genreId || title.toLowerCase(), genreName: title },
    });
  };

  return (
    <Pressable
      onPressIn={onPressIn}
      onPress={handlePress}
      style={[
        styles.card,
        width !== undefined ? { width } : null,
        height !== undefined ? { height } : null,
      ]}>
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
            <MaterialIcons name="image" size={48} color={theme.text.tertiary} />
          </View>
        )}

        {/* Bottom-to-top gradient fade for text readability */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.65)', 'rgba(0,0,0,0.92)']}
          style={styles.gradient}
        />

        {showButton ? (
          <View style={styles.content}>
            <Text style={styles.title} numberOfLines={2}>
              {title.toUpperCase()}
            </Text>
            <Text style={styles.hint}>Tap to Explore</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const makeStyles = (theme: ThemePalette) =>
  StyleSheet.create({
    card: {
      width: 280,
      aspectRatio: 3 / 5,
      borderRadius: Radius.xxl,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
      ...Shadow.medium,
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
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background.tertiary,
    },
    gradient: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: '55%',
    },
    content: {
      position: 'absolute',
      bottom: 28,
      left: 0,
      right: 0,
      paddingHorizontal: 20,
      alignItems: 'center',
    },
    // Card text sits on a dark gradient overlay above the poster image — white
    // is universally legible there, no theme override needed.
    title: {
      color: '#FFFFFF',
      fontSize: 28,
      fontWeight: '800',
      letterSpacing: 1.5,
      textAlign: 'center',
      fontFamily: FontFamily.rounded,
      textShadowColor: 'rgba(0,0,0,0.6)',
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 8,
    },
    hint: {
      color: 'rgba(255,255,255,0.75)',
      fontSize: 13,
      fontWeight: '500',
      marginTop: 10,
      fontFamily: Platform.select({
        ios: 'System',
        android: 'Roboto',
      }),
      letterSpacing: 0.4,
    },
  });

export const GenreCard = memo(GenreCardComponent);
