// Sticky "Today" section that surfaces airing anime as horizontal cards.
// Mirrors the iOS TodayUpdatesSection: collapsible header with sparkle icon,
// horizontal scroller of compact today-cards underneath.

import { memo, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Anime } from '../rate/types';
import { Colors, FontFamily, Radius, Spacing, Typography } from '../../constants/DesignSystem';

interface TodayUpdatesSectionProps {
  todayAnime: Anime[];
  initiallyCollapsed?: boolean;
}

function formatAiringTime(airingAt?: number): string | null {
  if (!airingAt) return null;
  const date = new Date(airingAt * 1000);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function TodayUpdatesSectionComponent({
  todayAnime,
  initiallyCollapsed = false,
}: TodayUpdatesSectionProps) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);

  if (!todayAnime || todayAnime.length === 0) return null;
  const display = todayAnime.slice(0, 12);

  return (
    <View style={styles.container}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      ) : null}
      <View pointerEvents="none" style={styles.surface} />
      <View pointerEvents="none" style={styles.surfaceBorder} />

      <Pressable onPress={() => setCollapsed((p) => !p)} style={styles.header}>
        <Ionicons name="sparkles" size={16} color={Colors.primary} />
        <Text style={styles.title}>Today</Text>
        <Text style={styles.count}>({todayAnime.length})</Text>
        <View style={{ flex: 1 }} />
        <Ionicons
          name={collapsed ? 'chevron-down' : 'chevron-up'}
          size={16}
          color={Colors.text.tertiary}
        />
      </Pressable>

      {!collapsed ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          {display.map((anime) => (
            <Pressable
              key={anime.id}
              onPress={() => router.push(`/(rate)/anime/${anime.id}`)}
              style={styles.card}>
              <Image
                source={{ uri: anime.image }}
                style={styles.poster}
                resizeMode="cover"
              />
              <View style={styles.cardText}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {anime.title}
                </Text>
                {anime.nextAiringEpisode ? (
                  <Text style={styles.cardTime}>
                    {formatAiringTime(anime.nextAiringEpisode.airingAt)}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    marginHorizontal: Spacing.md,
    borderRadius: Radius.card,
    marginBottom: Spacing.sm,
  },
  surface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.glass.dark,
  },
  surfaceBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
  },
  title: {
    ...Typography.titleSmall,
    color: Colors.text.primary,
    fontFamily: FontFamily.rounded,
  },
  count: {
    ...Typography.bodySmall,
    color: Colors.text.tertiary,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  card: {
    width: 168,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 6,
    marginRight: Spacing.xs,
    backgroundColor: Colors.glass.light,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  poster: {
    width: 40,
    height: 56,
    borderRadius: Radius.sm,
    backgroundColor: Colors.background.tertiary,
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    ...Typography.captionSmall,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  cardTime: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
    fontFamily: FontFamily.rounded,
  },
});

export const TodayUpdatesSection = memo(TodayUpdatesSectionComponent);
