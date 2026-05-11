import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { ThemedSurface, ThemedText } from '../themed';

export interface OverviewStat {
  label: string;
  value: number;
  /** Optional emphasis color for the value (defaults to text.primary). */
  color?: string;
}

interface CollectionOverviewCardProps {
  /** Optional total override. If omitted, computed from the sum of stats. */
  total?: number;
  stats: OverviewStat[];
}

function CollectionOverviewCardComponent({ total, stats }: CollectionOverviewCardProps) {
  const { theme } = useTheme();
  const totalValue = total ?? stats.reduce((acc, s) => acc + (s.value || 0), 0);

  return (
    <ThemedSurface style={[styles.card, { borderRadius: 18 }]}>
      <View style={styles.headerRow}>
        <ThemedText
          variant="titleSmall"
          tone="secondary"
          style={styles.overviewLabel}>
          OVERVIEW
        </ThemedText>
        <View style={styles.totalGroup}>
          <ThemedText variant="displayMedium" weight="800" style={styles.totalValue}>
            {totalValue}
          </ThemedText>
          <ThemedText variant="bodySmall" tone="secondary">
            total
          </ThemedText>
        </View>
      </View>

      <View style={styles.statsRow}>
        {stats.map((stat) => (
          <View
            key={stat.label}
            style={[styles.statTile, { backgroundColor: theme.background.tertiary }]}>
            <ThemedText
              variant="titleLarge"
              weight="800"
              style={[styles.statValue, stat.color ? { color: stat.color } : null]}>
              {stat.value}
            </ThemedText>
            <ThemedText variant="captionSmall" tone="secondary">
              {stat.label}
            </ThemedText>
          </View>
        ))}
      </View>
    </ThemedSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg - 2,
    gap: Spacing.sm + 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  overviewLabel: {
    letterSpacing: 1,
  },
  totalGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  totalValue: {
    fontSize: 28,
    lineHeight: 32,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statTile: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: Radius.md,
    alignItems: 'flex-start',
    gap: 2,
  },
  statValue: {
    fontSize: 22,
    lineHeight: 26,
  },
});

export const CollectionOverviewCard = memo(CollectionOverviewCardComponent);
