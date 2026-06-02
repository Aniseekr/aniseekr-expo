import { Image } from 'expo-image';
import { memo, useMemo } from 'react';
import { Pressable, Text, View, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Anime } from './types';
import { Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { NearbyPilgrimageBadge } from '../pilgrimage/NearbyPilgrimageBadge';

type Props = {
  anime: Anime;
  onPress?: () => void;
  width?: number;
  height?: number;
  /**
   * Optional Bangumi subject id. When supplied, a small location badge is
   * rendered in the top-right when pilgrimage data exists for this anime.
   */
  bangumiId?: number;
};

const DEFAULT_WIDTH = 140;
const DEFAULT_HEIGHT = 210;

function SimpleAnimeCardComponent({
  anime,
  onPress,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  bangumiId,
}: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <Pressable onPress={onPress} style={{ width, marginRight: Spacing.sm }}>
      <View style={[styles.cardContainer, { height }]}>
        <Image
          source={{ uri: anime.image }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
        />
        {/* Gradient overlay for text readability */}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.gradient} />
        {bangumiId !== undefined ? (
          <View style={styles.pilgrimageBadge}>
            <NearbyPilgrimageBadge bangumiId={bangumiId} variant="icon" />
          </View>
        ) : null}
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={2}>
            {anime.title}
          </Text>
          {anime.score != null && anime.score > 0 && (
            <Text style={styles.score}>★ {anime.score}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const makeStyles = (theme: ThemePalette) =>
  StyleSheet.create({
    cardContainer: {
      borderRadius: Radius.card,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
      position: 'relative',
      borderWidth: 1,
      borderColor: theme.glassBorder,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
        },
        android: {
          elevation: 4,
        },
      }),
    },
    gradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '55%',
    },
    textContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: Spacing.sm,
    },
    // Sits on a dark gradient over the poster, white is legible across themes.
    title: {
      color: '#FFFFFF',
      ...Typography.titleSmall,
      marginBottom: 4,
      textShadowColor: 'rgba(0,0,0,0.6)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    score: {
      color: theme.accent,
      fontSize: 11,
      fontWeight: '700',
    },
    pilgrimageBadge: {
      position: 'absolute',
      top: Spacing.xxs,
      right: Spacing.xxs,
    },
  });

export const SimpleAnimeCard = memo(SimpleAnimeCardComponent);
