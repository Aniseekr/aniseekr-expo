import { useEffect, useMemo, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../../../context/ThemeContext';
import { Radius, Spacing, Typography } from '../../../../constants/DesignSystem';
import { ThemedText, readableTextOn, Skeleton } from '../../../../components/themed';
import { EmptyStateView } from '../../../../components/common/EmptyStateView';
import { StatsExhibitFrame } from '../../../../components/collection/stats/StatsExhibitFrame';
import { MonthlyHoursBar } from '../../../../components/collection/stats/MonthlyHoursBar';
import {
  loadUserAnimeRows,
  longestStreakDays,
  monthlyHours,
  summarize,
  yearScope,
} from '../../../../libs/services/collection/stats-service';

const HERO_FROM = '#FF6CAB';
const HERO_TO = '#FF8E1E';

export default function YearInReviewExhibit() {
  const { theme } = useTheme();
  const [year] = useState(() => new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    yearRowsCount: number;
    hours: number;
    monthly: ReturnType<typeof monthlyHours>;
    topAnime: { title: string; score: number | null; episodes: number } | null;
    longestStreak: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await loadUserAnimeRows();
        if (cancelled) return;
        const yearRows = yearScope(rows, year);
        const summary = summarize(yearRows);
        const monthly = monthlyHours(rows, year);
        const topRow = yearRows
          .filter((r) => typeof r.score === 'number' && r.score! > 0)
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
        setData({
          yearRowsCount: yearRows.length,
          hours: summary.watchHoursEst,
          monthly,
          topAnime: topRow
            ? {
                title: topRow.title ?? 'Untitled',
                score: topRow.score ?? null,
                episodes: topRow.total_episodes ?? topRow.progress ?? 0,
              }
            : null,
          longestStreak: longestStreakDays(summary.completedDates),
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year]);

  const handleShare = useMemo(
    () =>
      data
        ? async () => {
            await Share.share({
              message: `My ${year} in Anime — ${data.yearRowsCount} shows, ${data.hours}h watched.`,
            });
          }
        : undefined,
    [data, year]
  );

  if (loading) {
    return (
      <StatsExhibitFrame title="Year in Review">
        <Skeleton.StatsDashboard />
      </StatsExhibitFrame>
    );
  }

  if (!data || data.yearRowsCount === 0) {
    return (
      <StatsExhibitFrame title="Year in Review">
        <EmptyStateView
          icon="auto-stories"
          title={`Nothing finished in ${year} yet`}
          description="Once you complete anime this year, your recap will appear here."
        />
      </StatsExhibitFrame>
    );
  }

  const onHero = readableTextOn(HERO_FROM);

  return (
    <StatsExhibitFrame title="Year in Review" onShare={handleShare}>
      <LinearGradient
        colors={[HERO_FROM, HERO_TO]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { borderColor: theme.glassBorder }]}
      >
        <ThemedText
          variant="captionSmall"
          weight="700"
          style={{ color: `${onHero}CC`, letterSpacing: 2 }}
        >
          # YEAR IN REVIEW
        </ThemedText>
        <ThemedText style={[styles.heroTitle, { color: onHero }]}>
          Your {year} in Anime
        </ThemedText>
        <ThemedText variant="bodyMedium" style={{ color: `${onHero}DD` }}>
          A year of stories, scores, and late nights.
        </ThemedText>
        <View style={styles.heroStats}>
          <Stat label="Shows" value={String(data.yearRowsCount)} color={onHero} />
          {data.hours > 0 ? <Stat label="Hours" value={String(data.hours)} color={onHero} /> : null}
          {data.longestStreak > 1 ? (
            <Stat label="Longest streak" value={`${data.longestStreak}d`} color={onHero} />
          ) : null}
        </View>
      </LinearGradient>

      {data.topAnime ? (
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
            },
          ]}
        >
          <ThemedText variant="captionSmall" tone="secondary" weight="700" style={{ letterSpacing: 2 }}>
            #1 TOP ANIME
          </ThemedText>
          <ThemedText variant="titleLarge" weight="800" style={{ marginTop: 6 }}>
            {data.topAnime.title}
          </ThemedText>
          <View style={styles.cardMetaRow}>
            {data.topAnime.episodes > 0 ? (
              <ThemedText variant="captionSmall" tone="tertiary">
                {data.topAnime.episodes} eps
              </ThemedText>
            ) : null}
            {data.topAnime.score ? (
              <ThemedText variant="captionSmall" tone="tertiary">
                · score {data.topAnime.score}
              </ThemedText>
            ) : null}
          </View>
        </View>
      ) : null}

      {data.monthly.some((b) => b.hours > 0) ? (
        <MonthlyHoursBar data={data.monthly} year={year} title="Hours by month" />
      ) : null}
    </StatsExhibitFrame>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText style={[styles.statValue, { color }]}>{value}</ThemedText>
      <ThemedText variant="captionSmall" style={{ color: `${color}BB` }}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: Radius.cardLg,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: 6,
  },
  heroTitle: {
    ...Typography.displayLarge,
    marginTop: 6,
  },
  heroStats: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginTop: Spacing.md,
  },
  stat: {
    gap: 2,
  },
  statValue: {
    ...Typography.headlineMedium,
    fontWeight: '800',
  },
  card: {
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: Spacing.md,
  },
  cardMetaRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
});
