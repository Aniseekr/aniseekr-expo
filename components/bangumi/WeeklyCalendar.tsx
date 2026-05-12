// Compact horizontally-scrolling week column layout. Used as a fallback
// alongside the FocusDayCarousel; styled with the iOS-aligned tokens
// (orange accent for today, glass border otherwise).

import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Anime } from '../rate/types';
import { Colors, FontFamily, Radius, Spacing, Typography } from '../../constants/DesignSystem';

interface WeeklyCalendarProps {
  weekDays: string[];
  groupedAnime: { day: string; anime: Anime[] }[];
  isCurrentDay: (day: string) => boolean;
  dayShortName: (day: string) => string;
}

export function WeeklyCalendar({
  weekDays,
  groupedAnime,
  isCurrentDay,
  dayShortName,
}: WeeklyCalendarProps) {
  const router = useRouter();

  const renderDayColumn = (day: string) => {
    const dayData = groupedAnime.find((d) => d.day === day) || { day, anime: [] };
    const isToday = isCurrentDay(day);

    return (
      <View key={day} style={[styles.dayColumn, isToday && styles.dayColumnToday]}>
        <View style={styles.dayHeader}>
          <Text style={[styles.dayTitle, isToday && styles.dayTitleToday]}>
            {dayShortName(day)}
          </Text>
          <Text style={styles.dayCount}>{dayData.anime.length} shows</Text>
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.animeScroll}
          contentContainerStyle={styles.animeScrollContent}>
          {dayData.anime.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="tv-off" size={32} color={Colors.text.tertiary} />
              <Text style={styles.emptyText}>No Signal</Text>
            </View>
          ) : (
            <View style={{ gap: Spacing.sm }}>
              {dayData.anime.map((anime) => (
                <Pressable
                  onPress={() => router.push(`/anime/${anime.id}`)}
                  key={anime.id}
                  style={styles.animeCard}>
                  <Image
                    source={{ uri: anime.image }}
                    style={styles.animeImage}
                    resizeMode="cover"
                  />
                  <Text style={styles.animeTitle} numberOfLines={2}>
                    {anime.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.horizontalScroll}
        contentContainerStyle={styles.scrollContent}>
        <View style={styles.daysContainer}>{weekDays.map((day) => renderDayColumn(day))}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  horizontalScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  daysContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  dayColumn: {
    width: 168,
    padding: Spacing.md,
    marginRight: Spacing.md,
    backgroundColor: Colors.glass.dark,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    minHeight: 400,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  dayColumnToday: {
    backgroundColor: Colors.glass.heavy,
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  dayHeader: {
    marginBottom: Spacing.sm,
  },
  dayTitle: {
    ...Typography.titleLarge,
    fontFamily: FontFamily.rounded,
    color: Colors.text.primary,
  },
  dayTitleToday: {
    color: Colors.primary,
  },
  dayCount: {
    ...Typography.captionSmall,
    color: Colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  animeScroll: {
    flex: 1,
    maxHeight: 500,
  },
  animeScrollContent: {
    paddingBottom: 8,
  },
  emptyContainer: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    ...Typography.bodySmall,
    color: Colors.text.tertiary,
    marginTop: Spacing.xs,
  },
  animeCard: {
    backgroundColor: Colors.glass.medium,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  animeImage: {
    width: '100%',
    height: 96,
    borderRadius: Radius.sm,
    marginBottom: 8,
  },
  animeTitle: {
    ...Typography.captionSmall,
    color: Colors.text.primary,
    fontWeight: '600',
    lineHeight: 16,
  },
});
