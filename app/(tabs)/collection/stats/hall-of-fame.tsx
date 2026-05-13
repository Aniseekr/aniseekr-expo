import { useEffect, useMemo, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '../../../../context/ThemeContext';
import { Radius, Spacing, Typography } from '../../../../constants/DesignSystem';
import { ThemedText, readableTextOn, Skeleton } from '../../../../components/themed';
import { EmptyStateView } from '../../../../components/common/EmptyStateView';
import { StatsExhibitFrame } from '../../../../components/collection/stats/StatsExhibitFrame';
import {
  achievementService,
  AchievementWithProgress,
} from '../../../../libs/services/achievements/achievement-service';

const TROPHY_FROM = '#F2994A';
const TROPHY_TO = '#F2C94C';

export default function HallOfFameExhibit() {
  const { theme } = useTheme();
  const [items, setItems] = useState<AchievementWithProgress[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await achievementService.list();
        if (!cancelled) setItems(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const featured = useMemo(() => {
    if (!items) return null;
    return (
      items
        .filter((a) => a.unlocked && a.unlockedAt)
        .sort((a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0))[0] ?? null
    );
  }, [items]);

  const earned = useMemo(() => items?.filter((a) => a.unlocked) ?? [], [items]);
  const locked = useMemo(() => items?.filter((a) => !a.unlocked) ?? [], [items]);

  const handleShare = useMemo(
    () =>
      featured
        ? async () => {
            await Share.share({
              message: `Unlocked "${featured.title}" — ${featured.description}`,
            });
          }
        : undefined,
    [featured]
  );

  if (loading) {
    return (
      <StatsExhibitFrame title="Hall of Fame">
        <Skeleton.ListRow count={8} avatarShape="square" />
      </StatsExhibitFrame>
    );
  }

  if (!items || items.length === 0) {
    return (
      <StatsExhibitFrame title="Hall of Fame">
        <EmptyStateView
          icon="emoji-events"
          title="No achievements yet"
          description="Earn your first achievement by rating or syncing anime."
        />
      </StatsExhibitFrame>
    );
  }

  const onTrophy = readableTextOn(TROPHY_FROM);
  const unlockedRatio = items.length > 0 ? Math.round((earned.length / items.length) * 100) : 0;

  return (
    <StatsExhibitFrame title="Hall of Fame" onShare={handleShare}>
      {featured ? (
        <LinearGradient
          colors={[TROPHY_FROM, TROPHY_TO]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.featured, { borderColor: theme.glassBorder }]}>
          <View style={[styles.featuredIcon, { backgroundColor: `${onTrophy}22` }]}>
            <MaterialIcons
              name={(featured.icon as React.ComponentProps<typeof MaterialIcons>['name']) || 'emoji-events'}
              size={48}
              color={onTrophy}
            />
          </View>
          <View style={styles.featuredBadge}>
            <ThemedText variant="captionSmall" weight="700" style={{ color: TROPHY_FROM }}>
              LEGENDARY
            </ThemedText>
          </View>
          <ThemedText style={[styles.featuredTitle, { color: onTrophy }]}>
            {featured.title}
          </ThemedText>
          <ThemedText variant="bodyMedium" style={{ color: `${onTrophy}DD` }}>
            {featured.description}
          </ThemedText>
          <ThemedText variant="captionSmall" style={{ color: `${onTrophy}AA`, marginTop: 6 }}>
            Earned {featured.unlockedAt
              ? new Date(featured.unlockedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : '—'}
          </ThemedText>
        </LinearGradient>
      ) : null}

      <View style={styles.sectionHeader}>
        <ThemedText variant="captionSmall" tone="secondary" weight="700" style={{ letterSpacing: 2 }}>
          RARE MEDALLIONS
        </ThemedText>
        <ThemedText variant="captionSmall" tone="tertiary">
          {earned.length} of {items.length} · {unlockedRatio}%
        </ThemedText>
      </View>

      {earned.length === 0 ? (
        <ThemedText variant="bodySmall" tone="tertiary">
          No trophies yet — your earned ones will appear here.
        </ThemedText>
      ) : (
        <View style={styles.grid}>
          {earned.map((a) => (
            <View
              key={a.id}
              style={[
                styles.medallion,
                {
                  backgroundColor: theme.background.secondary,
                  borderColor: `${theme.accent}55`,
                },
              ]}
            >
              <View style={[styles.medallionIcon, { backgroundColor: `${theme.accent}22` }]}>
                <MaterialIcons
                  name={(a.icon as React.ComponentProps<typeof MaterialIcons>['name']) || 'star'}
                  size={28}
                  color={theme.accent}
                />
              </View>
              <ThemedText variant="bodySmall" weight="700" numberOfLines={1} align="center">
                {a.title}
              </ThemedText>
              <ThemedText variant="captionSmall" tone="tertiary" align="center" numberOfLines={1}>
                {a.unlockedAt
                  ? new Date(a.unlockedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '—'}
              </ThemedText>
            </View>
          ))}
        </View>
      )}

      {locked.length > 0 ? (
        <>
          <View style={[styles.sectionHeader, { marginTop: Spacing.md }]}>
            <ThemedText variant="captionSmall" tone="secondary" weight="700" style={{ letterSpacing: 2 }}>
              IN PROGRESS
            </ThemedText>
          </View>
          <View style={styles.list}>
            {locked.map((a) => {
              const ratio = a.target > 0 ? Math.min(1, a.progress / a.target) : 0;
              return (
                <View
                  key={a.id}
                  style={[
                    styles.lockedRow,
                    {
                      backgroundColor: theme.background.secondary,
                      borderColor: theme.glassBorder,
                    },
                  ]}
                >
                  <View style={[styles.lockedIcon, { backgroundColor: `${theme.text.tertiary}1A` }]}>
                    <MaterialIcons
                      name={(a.icon as React.ComponentProps<typeof MaterialIcons>['name']) || 'lock'}
                      size={18}
                      color={theme.text.tertiary}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <ThemedText variant="titleSmall" weight="700">
                      {a.title}
                    </ThemedText>
                    <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
                      {a.description}
                    </ThemedText>
                    <View style={[styles.track, { backgroundColor: theme.background.tertiary }]}>
                      <View
                        style={[
                          styles.fill,
                          { width: `${Math.round(ratio * 100)}%`, backgroundColor: theme.accent },
                        ]}
                      />
                    </View>
                  </View>
                  <ThemedText variant="captionSmall" tone="secondary" weight="700">
                    {a.progress}/{a.target}
                  </ThemedText>
                </View>
              );
            })}
          </View>
        </>
      ) : null}
    </StatsExhibitFrame>
  );
}

const styles = StyleSheet.create({
  featured: {
    borderRadius: Radius.cardLg,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: 4,
    alignItems: 'flex-start',
  },
  featuredIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    alignSelf: 'center',
  },
  featuredBadge: {
    backgroundColor: '#1A1A1AAA',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  featuredTitle: {
    ...Typography.headlineMedium,
    fontWeight: '800',
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  medallion: {
    width: '48%',
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 6,
  },
  medallionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    gap: Spacing.sm,
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  lockedIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});
