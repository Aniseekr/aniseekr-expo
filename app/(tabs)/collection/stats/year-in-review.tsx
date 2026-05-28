import { useEffect, useMemo, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../../../context/ThemeContext';
import { Radius, Spacing, Typography } from '../../../../constants/DesignSystem';
import { ThemedText, readableTextOn, Skeleton } from '../../../../components/themed';
import { EmptyStateView } from '../../../../components/common/EmptyStateView';
import { StatsExhibitFrame } from '../../../../components/collection/stats/StatsExhibitFrame';
import { MonthlyHoursBar } from '../../../../components/collection/stats/MonthlyHoursBar';
import { useT } from '../../../../libs/i18n';
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
  const t = useT();
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
                title: topRow.title ?? '',
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
              message: t('collectionStats.yearInReview.shareMessage', {
                year,
                shows: data.yearRowsCount,
                hours: data.hours,
              }),
            });
          }
        : undefined,
    [data, year, t]
  );

  if (loading) {
    return (
      <StatsExhibitFrame title={t('collectionStats.yearInReview.title')}>
        <Skeleton.StatsDashboard />
      </StatsExhibitFrame>
    );
  }

  if (!data || data.yearRowsCount === 0) {
    return (
      <StatsExhibitFrame title={t('collectionStats.yearInReview.title')}>
        <EmptyStateView
          icon="auto-stories"
          title={t('collectionStats.yearInReview.emptyTitle', { year })}
          description={t('collectionStats.yearInReview.emptyBody')}
        />
      </StatsExhibitFrame>
    );
  }

  const onHero = readableTextOn(HERO_FROM);

  return (
    <StatsExhibitFrame title={t('collectionStats.yearInReview.title')} onShare={handleShare}>
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
          {t('collectionStats.yearInReview.eyebrow')}
        </ThemedText>
        <ThemedText style={[styles.heroTitle, { color: onHero }]}>
          {t('collectionStats.yearInReview.heroTitle', { year })}
        </ThemedText>
        <ThemedText variant="bodyMedium" style={{ color: `${onHero}DD` }}>
          {t('collectionStats.yearInReview.heroSubtitle')}
        </ThemedText>
        <View style={styles.heroStats}>
          <Stat label={t('collectionStats.yearInReview.statShows')} value={String(data.yearRowsCount)} color={onHero} />
          {data.hours > 0 ? (
            <Stat label={t('collectionStats.yearInReview.statHours')} value={String(data.hours)} color={onHero} />
          ) : null}
          {data.longestStreak > 1 ? (
            <Stat
              label={t('collectionStats.yearInReview.statLongestStreak')}
              value={t('collectionStats.yearInReview.daysShort', { count: data.longestStreak })}
              color={onHero}
            />
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
            {t('collectionStats.yearInReview.topAnimeBadge')}
          </ThemedText>
          <ThemedText variant="titleLarge" weight="800" style={{ marginTop: 6 }}>
            {data.topAnime.title || t('collectionStats.yearInReview.untitled')}
          </ThemedText>
          <View style={styles.cardMetaRow}>
            {data.topAnime.episodes > 0 ? (
              <ThemedText variant="captionSmall" tone="tertiary">
                {t('collectionStats.yearInReview.epsShort', { count: data.topAnime.episodes })}
              </ThemedText>
            ) : null}
            {data.topAnime.score ? (
              <ThemedText variant="captionSmall" tone="tertiary">
                {t('collectionStats.yearInReview.scoreLabel', { score: data.topAnime.score })}
              </ThemedText>
            ) : null}
          </View>
        </View>
      ) : null}

      {data.monthly.some((b) => b.hours > 0) ? (
        <MonthlyHoursBar data={data.monthly} year={year} title={t('collectionStats.yearInReview.monthlyTitle')} />
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
