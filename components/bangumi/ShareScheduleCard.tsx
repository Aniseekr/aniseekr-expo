import type { Ref } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Anime } from '../rate/types';
import { Colors, FontFamily, Radius, Spacing, Typography } from '../../constants/DesignSystem';

interface DailyAnime {
  day: string;
  anime: Anime[];
}

export interface ShareScheduleCardProps {
  seasonLabel: string;
  groupedAnime: DailyAnime[];
  totalCount: number;
  ref?: Ref<View>;
}

const POSTER_WIDTH = 1080;
const POSTER_HEIGHT = 1920;

const dayShort: Record<string, string> = {
  Mondays: 'Mon',
  Tuesdays: 'Tue',
  Wednesdays: 'Wed',
  Thursdays: 'Thu',
  Fridays: 'Fri',
  Saturdays: 'Sat',
  Sundays: 'Sun',
  Unknown: 'TBD',
};

const ORDERED_DAYS = [
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
  'Sundays',
];

export function ShareScheduleCard({
  seasonLabel,
  groupedAnime,
  totalCount,
  ref,
}: ShareScheduleCardProps) {
  const grouped = new Map<string, Anime[]>();
  groupedAnime.forEach((g) => grouped.set(g.day, g.anime));

  return (
    <View ref={ref} collapsable={false} style={styles.poster}>
      <LinearGradient
        colors={Colors.gradients.background as [string, string, ...string[]]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(255, 159, 10, 0.18)', 'rgba(191, 90, 242, 0.10)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <Text style={styles.brand}>Aniseekr</Text>
        <Text style={styles.season}>{seasonLabel}</Text>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{totalCount} entries this season</Text>
        </View>
      </View>

      <View style={styles.grid}>
        {ORDERED_DAYS.map((day) => {
          const items = (grouped.get(day) ?? []).slice(0, 3);
          return (
            <View key={day} style={styles.column}>
              <View style={styles.columnHeader}>
                <Text style={styles.columnDay}>{dayShort[day] ?? day}</Text>
              </View>
              <View style={styles.columnBody}>
                {items.length === 0 ? (
                  <Text style={styles.empty}>No releases</Text>
                ) : (
                  items.map((anime) => (
                    <View key={anime.id} style={styles.entry}>
                      {anime.image ? (
                        <Image
                          source={{ uri: anime.image }}
                          style={styles.cover}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.cover, styles.coverFallback]} />
                      )}
                      <Text style={styles.entryTitle} numberOfLines={2}>
                        {anime.title}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Generated with Aniseekr</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  poster: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    paddingHorizontal: 64,
    paddingTop: 96,
    paddingBottom: 80,
    backgroundColor: Colors.background.primary,
  },
  header: {
    alignItems: 'flex-start',
    marginBottom: 56,
  },
  brand: {
    ...Typography.displayLarge,
    fontSize: 96,
    lineHeight: 104,
    color: Colors.primary,
    fontFamily: FontFamily.rounded,
    fontWeight: '800',
    letterSpacing: -1,
  },
  season: {
    ...Typography.displayMedium,
    fontSize: 56,
    lineHeight: 64,
    color: Colors.text.primary,
    fontFamily: FontFamily.rounded,
    fontWeight: '700',
    marginTop: Spacing.sm,
  },
  countPill: {
    marginTop: Spacing.lg,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glass.borderHeavy,
    backgroundColor: Colors.glass.medium,
  },
  countText: {
    fontSize: 28,
    fontWeight: '600',
    color: Colors.text.primary,
    fontFamily: FontFamily.text,
    letterSpacing: 0.4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    flex: 1,
  },
  column: {
    width: (POSTER_WIDTH - 64 * 2 - 16 * 6) / 7,
    backgroundColor: Colors.glass.dark,
    borderRadius: Radius.cardLg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    overflow: 'hidden',
  },
  columnHeader: {
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: Colors.glass.medium,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glass.border,
  },
  columnDay: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.primary,
    fontFamily: FontFamily.rounded,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  columnBody: {
    flex: 1,
    padding: 12,
    gap: 12,
  },
  entry: {
    alignItems: 'center',
    gap: 8,
  },
  cover: {
    width: '100%',
    aspectRatio: 0.7,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  coverFallback: {
    backgroundColor: Colors.glass.medium,
  },
  entryTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '600',
    color: Colors.text.primary,
    fontFamily: FontFamily.text,
    textAlign: 'center',
  },
  empty: {
    fontSize: 18,
    color: Colors.text.tertiary,
    textAlign: 'center',
    fontFamily: FontFamily.text,
    paddingVertical: 24,
  },
  footer: {
    marginTop: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 24,
    fontWeight: '500',
    color: Colors.text.secondary,
    fontFamily: FontFamily.text,
    letterSpacing: 0.5,
  },
});
