import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../../../context/ThemeContext';
import { Spacing } from '../../../../constants/DesignSystem';
import { ThemedText } from '../../../../components/themed';
import { ShimmerEffect } from '../../../../components/common/ShimmerEffect';
import { EmptyStateView } from '../../../../components/common/EmptyStateView';
import { ErrorStateView } from '../../../../components/common/ErrorStateView';
import { StatsExhibitFrame } from '../../../../components/collection/stats/StatsExhibitFrame';
import { StatsHeroCard } from '../../../../components/collection/stats/StatsHeroCard';
import { StatusDonutCard } from '../../../../components/collection/stats/StatusDonutCard';
import { MonthlyHoursBar } from '../../../../components/collection/stats/MonthlyHoursBar';
import { AchievementsGrid } from '../../../../components/collection/stats/AchievementsGrid';
import { ExhibitCard } from '../../../../components/collection/stats/ExhibitCard';
import {
  loadUserAnimeRows,
  monthlyHours,
  summarize,
  StatsSummary,
} from '../../../../libs/services/collection/stats-service';
import {
  achievementService,
  AchievementWithProgress,
} from '../../../../libs/services/achievements/achievement-service';

const STATUS_COLORS = {
  watching: '#30D158',
  completed: '#0A84FF',
  planned: '#5E5CE6',
  dropped: '#FF453A',
  onHold: '#FF9F0A',
} as const;

export default function CollectionStatsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [monthly, setMonthly] = useState<ReturnType<typeof monthlyHours>>([]);
  const [achievements, setAchievements] = useState<AchievementWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [rows, ach] = await Promise.all([
          loadUserAnimeRows(),
          achievementService.list(),
        ]);
        if (cancelled) return;
        const s = summarize(rows);
        setSummary(s);
        setMonthly(monthlyHours(rows));
        setAchievements(ach);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load stats');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const year = new Date().getFullYear();
  const heroBadge = `Year in review · ${year}`;

  const heroHighlight = useMemo(() => {
    if (!summary) return undefined;
    if (summary.total >= 200) return 'Top 5%';
    if (summary.total >= 100) return 'Top 10%';
    if (summary.total >= 50) return 'Top 25%';
    return undefined;
  }, [summary]);

  const donutSlices = useMemo(() => {
    if (!summary) return [];
    return [
      { label: 'Watching', value: summary.watching, color: STATUS_COLORS.watching },
      { label: 'Completed', value: summary.completed, color: STATUS_COLORS.completed },
      { label: 'Plan', value: summary.planned, color: STATUS_COLORS.planned },
      { label: 'On hold', value: summary.onHold, color: STATUS_COLORS.onHold },
      { label: 'Dropped', value: summary.dropped, color: STATUS_COLORS.dropped },
    ];
  }, [summary]);

  const monthlyHasData = useMemo(() => monthly.some((b) => b.hours > 0), [monthly]);

  const exhibits = useMemo(
    () => [
      {
        id: 'persona',
        title: 'Anime Persona',
        subtitle: 'Discover your viewing archetype',
        icon: 'auto-awesome' as const,
        gradientFrom: '#7C5BFF',
        gradientTo: '#21D4FD',
        route: '/collection/stats/persona',
        featured: true,
        minTotal: 3,
      },
      {
        id: 'year-in-review',
        title: 'Year in Review',
        subtitle: 'Your watching year, recapped',
        icon: 'auto-stories' as const,
        gradientFrom: '#FF6CAB',
        gradientTo: '#FF8E1E',
        route: '/collection/stats/year-in-review',
        minTotal: 1,
      },
      {
        id: 'hall-of-fame',
        title: 'Hall of Fame',
        subtitle: 'Trophies, medallions, milestones',
        icon: 'emoji-events' as const,
        gradientFrom: '#F2994A',
        gradientTo: '#F2C94C',
        route: '/collection/stats/hall-of-fame',
        minTotal: 0,
      },
      {
        id: 'top-picks',
        title: 'Top 10 Picks',
        subtitle: 'Curated by your ratings',
        icon: 'star-rate' as const,
        gradientFrom: '#0F2027',
        gradientTo: '#2C5364',
        route: '/collection/stats/top-picks',
        minTotal: 3,
      },
      {
        id: 'top-favorites',
        title: 'My Top Favorites',
        subtitle: 'Why your #1 still hits',
        icon: 'favorite' as const,
        gradientFrom: '#FF5C8A',
        gradientTo: '#7C5BFF',
        route: '/collection/stats/top-favorites',
        minTotal: 1,
      },
    ],
    []
  );

  if (loading) {
    return (
      <StatsExhibitFrame title="Statistics">
        <ShimmerEffect width="100%" height={160} borderRadius={20} />
        <ShimmerEffect width="100%" height={180} borderRadius={16} />
        <ShimmerEffect width="100%" height={180} borderRadius={16} />
      </StatsExhibitFrame>
    );
  }

  if (error) {
    return (
      <StatsExhibitFrame title="Statistics">
        <ErrorStateView title="Couldn't load stats" message={error} />
      </StatsExhibitFrame>
    );
  }

  if (!summary || summary.total === 0) {
    return (
      <StatsExhibitFrame title="Statistics">
        <EmptyStateView
          icon="bar-chart"
          title="No stats yet"
          description="Start adding anime to your folders to see your library breakdown."
          actionLabel="Browse anime"
          onAction={() => router.push('/(rate)')}
        />
      </StatsExhibitFrame>
    );
  }

  return (
    <StatsExhibitFrame title="Statistics">
      <StatsHeroCard
        badge={heroBadge}
        highlight={heroHighlight}
        values={[
          {
            label: 'Watch hours (est.)',
            value: summary.watchHoursEst > 0 ? String(summary.watchHoursEst) : '—',
            hidden: summary.episodesWatched === 0,
          },
          {
            label: 'Anime',
            value: String(summary.total),
          },
          {
            label: 'Avg score',
            value: summary.avgScore > 0 ? summary.avgScore.toFixed(1) : '—',
            hidden: summary.rated === 0,
          },
        ]}
      />

      <View style={styles.row}>
        <View style={styles.flex1}>
          <StatusDonutCard slices={donutSlices} total={summary.total} centerLabel="anime" />
        </View>
      </View>

      {monthlyHasData ? (
        <MonthlyHoursBar data={monthly} year={year} />
      ) : null}

      {achievements.length > 0 ? (
        <AchievementsGrid
          achievements={achievements}
          onPressViewAll={() => router.push('/collection/stats/hall-of-fame')}
        />
      ) : null}

      <View style={styles.exhibitSection}>
        <ThemedText variant="titleLarge" weight="700">
          Exhibits
        </ThemedText>
        <ThemedText variant="bodySmall" tone="secondary">
          Tap into any exhibit to dig deeper, or share it as a card.
        </ThemedText>
        <View style={styles.exhibitGrid}>
          {exhibits
            .filter((e) => summary.total >= e.minTotal)
            .map((e) => (
              <ExhibitCard
                key={e.id}
                title={e.title}
                subtitle={e.subtitle}
                icon={e.icon}
                gradientFrom={e.gradientFrom}
                gradientTo={e.gradientTo}
                featured={e.featured}
                onPress={() => router.push(e.route as never)}
              />
            ))}
        </View>
      </View>
    </StatsExhibitFrame>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  flex1: { flex: 1 },
  exhibitSection: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  exhibitGrid: {
    gap: Spacing.sm,
  },
});
