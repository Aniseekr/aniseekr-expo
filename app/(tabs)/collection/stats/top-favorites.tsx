import { useEffect, useMemo, useState } from 'react';
import { Image, Share, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '../../../../context/ThemeContext';
import { Radius, Spacing, Typography } from '../../../../constants/DesignSystem';
import { ThemedText, readableTextOn, Skeleton } from '../../../../components/themed';
import { EmptyStateView } from '../../../../components/common/EmptyStateView';
import { StatsExhibitFrame } from '../../../../components/collection/stats/StatsExhibitFrame';
import { useT } from '../../../../libs/i18n';
import {
  loadUserAnimeRows,
  summarize,
  UserAnimeRow,
} from '../../../../libs/services/collection/stats-service';

const HERO_FROM = '#FF5C8A';
const HERO_TO = '#7C5BFF';

interface FavMeta {
  remembered: number;
  locations: { visited: number; total: number };
  rating: number | null;
}

function metaFor(row: UserAnimeRow): FavMeta {
  return {
    remembered: row.total_episodes ?? row.progress ?? 0,
    locations: { visited: 0, total: 0 },
    rating: typeof row.score === 'number' ? row.score : null,
  };
}

export default function TopFavoritesExhibit() {
  const { theme } = useTheme();
  const t = useT();
  const [favs, setFavs] = useState<UserAnimeRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await loadUserAnimeRows();
        if (cancelled) return;
        const summary = summarize(rows);
        setFavs(summary.topScored.slice(0, 5));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const top = favs?.[0] ?? null;
  const rest = favs?.slice(1) ?? [];

  const handleShare = useMemo(
    () =>
      top
        ? async () => {
            await Share.share({
              message: t('collectionStats.topFavorites.shareMessage', {
                title: top.title ?? t('collectionStats.topFavorites.untitled'),
                score: top.score ? ` (${top.score})` : '',
              }),
            });
          }
        : undefined,
    [top]
  );

  if (loading) {
    return (
      <StatsExhibitFrame title={t('collectionStats.topFavorites.title')}>
        <Skeleton.PosterGrid count={6} columns={2} aspectRatio={1.5} />
      </StatsExhibitFrame>
    );
  }

  if (!top) {
    return (
      <StatsExhibitFrame title={t('collectionStats.topFavorites.title')}>
        <EmptyStateView
          icon="favorite"
          title={t('collectionStats.topFavorites.emptyTitle')}
          description={t('collectionStats.topFavorites.emptyBody')}
        />
      </StatsExhibitFrame>
    );
  }

  const onHero = readableTextOn(HERO_FROM);
  const topMeta = metaFor(top);

  return (
    <StatsExhibitFrame title={t('collectionStats.topFavorites.title')} onShare={handleShare}>
      <ThemedText variant="bodySmall" tone="secondary">
        {t('collectionStats.topFavorites.subtitle', { count: favs?.length ?? 0 })}
      </ThemedText>
      <LinearGradient
        colors={[HERO_FROM, HERO_TO]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.featuredHero, { borderColor: theme.glassBorder }]}
      >
        <View style={styles.featuredTopRow}>
          <View style={[styles.badge, { backgroundColor: `${onHero}26` }]}>
            <MaterialIcons name="star" size={12} color={onHero} />
            <ThemedText variant="captionSmall" weight="700" style={{ color: onHero, letterSpacing: 1 }}>
              {t('collectionStats.topFavorites.allTimeBadge')}
            </ThemedText>
          </View>
          {topMeta.rating ? (
            <View style={[styles.badge, { backgroundColor: `${onHero}26` }]}>
              <ThemedText variant="captionSmall" weight="700" style={{ color: onHero }}>
                {topMeta.rating}
              </ThemedText>
            </View>
          ) : null}
        </View>
        {top.image_url ? (
          <Image source={{ uri: top.image_url }} style={styles.featuredImage} />
        ) : (
          <View style={[styles.featuredImage, { backgroundColor: `${onHero}1A` }]} />
        )}
        <ThemedText style={[styles.featuredTitle, { color: onHero }]}>
          {top.title ?? t('collectionStats.topFavorites.untitled')}
        </ThemedText>
        {topMeta.remembered > 0 ? (
          <View style={styles.metricRow}>
            <Metric
              label={t('collectionStats.topFavorites.metric.remembered')}
              value={t('collectionStats.topFavorites.metric.episodes', { count: topMeta.remembered })}
              color={onHero}
            />
            {topMeta.rating ? (
              <Metric
                label={t('collectionStats.topFavorites.metric.rating')}
                value={`${topMeta.rating}/10`}
                color={onHero}
              />
            ) : null}
          </View>
        ) : null}
      </LinearGradient>

      {rest.length > 0 ? (
        <View style={styles.restWrap}>
          <ThemedText variant="titleMedium" weight="700">
            {t('collectionStats.topFavorites.restTitle', { count: favs?.length ?? 0 })}
          </ThemedText>
          {rest.map((row, i) => {
            const meta = metaFor(row);
            return (
              <View
                key={row.anime_id}
                style={[
                  styles.restRow,
                  {
                    backgroundColor: theme.background.secondary,
                    borderColor: theme.glassBorder,
                  },
                ]}>
                <ThemedText style={[styles.restRank, { color: theme.text.tertiary }]}>
                  {i + 2}
                </ThemedText>
                {row.image_url ? (
                  <Image source={{ uri: row.image_url }} style={styles.restCover} />
                ) : (
                  <View style={[styles.restCover, { backgroundColor: theme.background.tertiary }]} />
                )}
                <View style={{ flex: 1, gap: 4 }}>
                  <ThemedText variant="titleSmall" weight="700" numberOfLines={2}>
                    {row.title ?? t('collectionStats.topFavorites.untitled')}
                  </ThemedText>
                  {meta.rating ? (
                    <ThemedText variant="captionSmall" tone="tertiary">
                      {t('collectionStats.topFavorites.ratingLabel', { rating: meta.rating })}
                    </ThemedText>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </StatsExhibitFrame>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ gap: 2 }}>
      <ThemedText variant="captionSmall" style={{ color: `${color}AA`, letterSpacing: 1 }}>
        {label}
      </ThemedText>
      <ThemedText style={[styles.metricValue, { color }]}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  featuredHero: {
    borderRadius: Radius.cardLg,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  featuredTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  featuredImage: {
    width: '100%',
    height: 220,
    borderRadius: Radius.lg,
    marginTop: Spacing.sm,
  },
  featuredTitle: {
    ...Typography.headlineMedium,
    fontWeight: '800',
    marginTop: 6,
  },
  metricRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginTop: 6,
  },
  metricValue: {
    ...Typography.titleLarge,
    fontWeight: '800',
  },
  restWrap: {
    gap: Spacing.sm,
  },
  restRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  restRank: {
    ...Typography.titleLarge,
    fontWeight: '800',
    width: 24,
    textAlign: 'center',
  },
  restCover: {
    width: 48,
    height: 64,
    borderRadius: 8,
  },
});
