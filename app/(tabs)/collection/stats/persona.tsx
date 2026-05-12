import { useEffect, useMemo, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../../../context/ThemeContext';
import { Radius, Spacing, Typography } from '../../../../constants/DesignSystem';
import { ThemedText, readableTextOn } from '../../../../components/themed';
import { ShimmerEffect } from '../../../../components/common/ShimmerEffect';
import { EmptyStateView } from '../../../../components/common/EmptyStateView';
import { StatsExhibitFrame } from '../../../../components/collection/stats/StatsExhibitFrame';
import {
  loadUserAnimeRows,
  summarize,
} from '../../../../libs/services/collection/stats-service';
import { computePersona, PersonaResult } from '../../../../libs/services/collection/persona';

export default function PersonaExhibit() {
  const { theme } = useTheme();
  const [persona, setPersona] = useState<PersonaResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasNoData, setHasNoData] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await loadUserAnimeRows();
        if (cancelled) return;
        const summary = summarize(rows);
        const result = computePersona(rows, summary);
        if (!result) {
          setHasNoData(true);
        } else {
          setPersona(result);
        }
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
      persona
        ? async () => {
            await Share.share({
              message: `My Aniseekr persona: ${persona.archetype.title} (${persona.match}% match)`,
            });
          }
        : undefined,
    [persona]
  );

  if (loading) {
    return (
      <StatsExhibitFrame title="Anime Persona">
        <ShimmerEffect width="100%" height={360} borderRadius={Radius.cardLg} />
        <ShimmerEffect width="100%" height={200} borderRadius={Radius.card} />
      </StatsExhibitFrame>
    );
  }

  if (hasNoData || !persona) {
    return (
      <StatsExhibitFrame title="Anime Persona">
        <EmptyStateView
          icon="auto-awesome"
          title="Persona not ready"
          description="Add and rate at least 3 anime to reveal your viewing archetype."
        />
      </StatsExhibitFrame>
    );
  }

  const { archetype, match, watchHours, sinceLabel, dimensions } = persona;
  const onArt = readableTextOn(archetype.imageBg.from);

  return (
    <StatsExhibitFrame title="Anime Persona" onShare={handleShare}>
      <LinearGradient
        colors={[archetype.imageBg.from, archetype.imageBg.to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.heroCard, { borderColor: theme.glassBorder }]}
      >
        <View style={styles.heroRow}>
          <View style={[styles.chip, { backgroundColor: `${onArt}26` }]}>
            <ThemedText variant="captionSmall" weight="700" style={{ color: onArt, letterSpacing: 1 }}>
              PERSONA TYPE {String(archetype.index).padStart(2, '0')} / {archetype.total}
            </ThemedText>
          </View>
          <View style={[styles.chip, { backgroundColor: `${onArt}26` }]}>
            <ThemedText variant="captionSmall" weight="700" style={{ color: onArt }}>
              RARE {archetype.rarity}%
            </ThemedText>
          </View>
        </View>
        <View style={styles.heroBody}>
          <ThemedText style={[styles.heroTitle, { color: onArt }]}>
            {archetype.title}
          </ThemedText>
          <ThemedText
            variant="bodyMedium"
            style={{ color: `${onArt}E0`, marginTop: 6 }}
          >
            {archetype.description}
          </ThemedText>
        </View>
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <ThemedText variant="captionSmall" style={{ color: `${onArt}AA` }}>
              MATCH
            </ThemedText>
            <ThemedText style={[styles.heroStatValue, { color: onArt }]}>
              {match}%
            </ThemedText>
          </View>
          {watchHours > 0 ? (
            <View style={styles.heroStat}>
              <ThemedText variant="captionSmall" style={{ color: `${onArt}AA` }}>
                VIEWED
              </ThemedText>
              <ThemedText style={[styles.heroStatValue, { color: onArt }]}>
                {watchHours}h
              </ThemedText>
            </View>
          ) : null}
          {sinceLabel ? (
            <View style={styles.heroStat}>
              <ThemedText variant="captionSmall" style={{ color: `${onArt}AA` }}>
                SINCE
              </ThemedText>
              <ThemedText style={[styles.heroStatValue, { color: onArt }]}>
                {sinceLabel}
              </ThemedText>
            </View>
          ) : null}
        </View>
        <View style={styles.tagRow}>
          {archetype.tags.map((tag) => (
            <View
              key={tag}
              style={[styles.tag, { backgroundColor: `${onArt}1A`, borderColor: `${onArt}40` }]}
            >
              <ThemedText variant="captionSmall" weight="600" style={{ color: onArt }}>
                {tag}
              </ThemedText>
            </View>
          ))}
        </View>
      </LinearGradient>

      <View
        style={[
          styles.dimensionsCard,
          {
            backgroundColor: theme.background.secondary,
            borderColor: theme.glassBorder,
          },
        ]}>
        <View style={styles.dimensionsHeader}>
          <ThemedText variant="titleMedium" weight="700">
            Personality dimensions
          </ThemedText>
          <ThemedText variant="captionSmall" tone="tertiary">
            {dimensions.length} axes
          </ThemedText>
        </View>
        <View style={styles.dimensionList}>
          {dimensions.map((d) => (
            <View key={d.key} style={styles.dimensionRow}>
              <View style={styles.dimensionLabelRow}>
                <ThemedText variant="bodyMedium" weight="600">
                  {d.label}
                </ThemedText>
                <ThemedText variant="bodyMedium" weight="700" style={{ color: d.color }}>
                  {d.value}
                </ThemedText>
              </View>
              <View style={[styles.track, { backgroundColor: theme.background.tertiary }]}>
                <View
                  style={[
                    styles.fill,
                    { width: `${d.value}%`, backgroundColor: d.color },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      </View>
    </StatsExhibitFrame>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: Radius.cardLg,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
    minHeight: 360,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  heroBody: {
    gap: 4,
  },
  heroTitle: {
    ...Typography.displayMedium,
    fontWeight: '800',
  },
  heroStats: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  heroStat: {
    gap: 2,
  },
  heroStatValue: {
    ...Typography.headlineSmall,
    fontWeight: '800',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  dimensionsCard: {
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  dimensionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dimensionList: {
    gap: Spacing.sm,
  },
  dimensionRow: {
    gap: 6,
  },
  dimensionLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
});
