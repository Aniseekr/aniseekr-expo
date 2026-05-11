import { useEffect, useMemo, useState } from 'react';
import { Image, Share, StyleSheet, View } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { Radius, Spacing, Typography } from '../../../constants/DesignSystem';
import { ThemedText } from '../../../components/themed';
import { ShimmerEffect } from '../../../components/common/ShimmerEffect';
import { EmptyStateView } from '../../../components/common/EmptyStateView';
import { StatsExhibitFrame } from '../../../components/collection/stats/StatsExhibitFrame';
import {
  loadUserAnimeRows,
  summarize,
  UserAnimeRow,
} from '../../../libs/services/collection/stats-service';

export default function TopPicksExhibit() {
  const { theme } = useTheme();
  const [picks, setPicks] = useState<UserAnimeRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await loadUserAnimeRows();
        if (cancelled) return;
        const summary = summarize(rows);
        setPicks(summary.topScored);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleShare = useMemo(
    () =>
      picks && picks.length > 0
        ? async () => {
            const lines = picks
              .slice(0, 10)
              .map((p, i) => `${i + 1}. ${p.title ?? 'Untitled'}${p.score ? ` — ${p.score}` : ''}`);
            await Share.share({ message: `My Top 10 Picks\n${lines.join('\n')}` });
          }
        : undefined,
    [picks]
  );

  if (loading) {
    return (
      <StatsExhibitFrame title="Top 10 Picks">
        <ShimmerEffect width="100%" height={120} borderRadius={Radius.cardLg} />
        <ShimmerEffect width="100%" height={120} borderRadius={Radius.card} />
        <ShimmerEffect width="100%" height={120} borderRadius={Radius.card} />
      </StatsExhibitFrame>
    );
  }

  if (!picks || picks.length === 0) {
    return (
      <StatsExhibitFrame title="Top 10 Picks">
        <EmptyStateView
          icon="star-rate"
          title="Rate to unlock"
          description="Rate a few anime — your top 10 will line up here automatically."
        />
      </StatsExhibitFrame>
    );
  }

  return (
    <StatsExhibitFrame title="My Top 10 Picks" onShare={handleShare}>
      <ThemedText variant="bodySmall" tone="secondary">
        A personal guide to anime worth your time
      </ThemedText>
      <ThemedText variant="captionSmall" tone="tertiary" weight="700" style={{ letterSpacing: 2 }}>
        UPDATED · {new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
      </ThemedText>
      {picks.map((p, i) => (
        <View
          key={p.anime_id}
          style={[
            styles.row,
            i === 0
              ? {
                  backgroundColor: theme.background.secondary,
                  borderColor: `${theme.accent}AA`,
                }
              : {
                  backgroundColor: theme.background.secondary,
                  borderColor: theme.glassBorder,
                },
          ]}
        >
          <ThemedText
            style={[
              styles.rank,
              { color: i === 0 ? theme.accent : theme.text.tertiary },
            ]}
          >
            {String(i + 1).padStart(2, '0')}
          </ThemedText>
          {p.image_url ? (
            <Image source={{ uri: p.image_url }} style={styles.cover} />
          ) : (
            <View style={[styles.cover, { backgroundColor: theme.background.tertiary }]} />
          )}
          <View style={{ flex: 1, gap: 4 }}>
            <ThemedText variant="titleSmall" weight="700" numberOfLines={2}>
              {p.title ?? 'Untitled'}
            </ThemedText>
            <View style={styles.metaRow}>
              {p.status ? (
                <ThemedText variant="captionSmall" tone="tertiary">
                  {p.status}
                </ThemedText>
              ) : null}
              {p.progress && p.total_episodes ? (
                <ThemedText variant="captionSmall" tone="tertiary">
                  · {p.progress}/{p.total_episodes}
                </ThemedText>
              ) : null}
            </View>
          </View>
          {p.score ? (
            <View style={[styles.score, { backgroundColor: `${theme.accent}26` }]}>
              <ThemedText variant="titleSmall" weight="800" style={{ color: theme.accent }}>
                {p.score}
              </ThemedText>
            </View>
          ) : null}
        </View>
      ))}
    </StatsExhibitFrame>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  rank: {
    ...Typography.titleLarge,
    fontWeight: '800',
    width: 32,
    textAlign: 'center',
  },
  cover: {
    width: 56,
    height: 80,
    borderRadius: 8,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 4,
  },
  score: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
});
