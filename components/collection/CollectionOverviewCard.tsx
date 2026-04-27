import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AniCard } from '../common/AniCard';
import {
  Colors,
  FontFamily,
  Radius,
  Spacing,
  Typography,
  IconSize,
} from '../../constants/DesignSystem';

interface OverviewStat {
  label: string;
  value: number;
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
}

interface RecentThumb {
  id: string;
  imageUrl?: string;
}

interface CollectionOverviewCardProps {
  stats: OverviewStat[];
  recents?: RecentThumb[];
  onViewAll?: () => void;
  onRecentPress?: (id: string) => void;
}

export function CollectionOverviewCard({
  stats,
  recents = [],
  onViewAll,
  onRecentPress,
}: CollectionOverviewCardProps) {
  const showRecents = recents.length > 0;

  return (
    <AniCard variant="glass" radius="cardLg" style={styles.card}>
      <View style={styles.statsRow}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.statBadge}>
            <View style={[styles.iconBubble, { backgroundColor: `${stat.color}26` }]}>
              <MaterialIcons name={stat.icon} size={IconSize.md - 2} color={stat.color} />
            </View>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {showRecents ? (
        <View style={styles.recentsBlock}>
          <View style={styles.recentsHeader}>
            <Text style={styles.recentsTitle}>Recently added</Text>
            {onViewAll ? (
              <Pressable onPress={onViewAll} hitSlop={8}>
                <Text style={styles.viewAll}>View all</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.thumbRow}>
            {recents.slice(0, 3).map((item) => (
              <Pressable
                key={item.id}
                onPress={() => onRecentPress?.(item.id)}
                style={styles.thumb}>
                {item.imageUrl ? (
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={styles.thumbImage}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.thumbPlaceholder}>
                    <MaterialIcons
                      name="image"
                      size={IconSize.md}
                      color={Colors.text.tertiary}
                    />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </AniCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.screenPadding,
    marginVertical: Spacing.md,
    padding: Spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  statBadge: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xxs,
    borderRadius: Radius.md,
    backgroundColor: Colors.glass.dark,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    gap: 6,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    ...Typography.titleLarge,
    color: Colors.text.primary,
    fontFamily: FontFamily.rounded,
    fontWeight: '700',
  },
  statLabel: {
    ...Typography.captionSmall,
    color: Colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  recentsBlock: {
    marginTop: Spacing.lg,
  },
  recentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  recentsTitle: {
    ...Typography.titleMedium,
    color: Colors.text.primary,
    fontFamily: FontFamily.rounded,
  },
  viewAll: {
    ...Typography.bodySmall,
    color: Colors.primary,
    fontWeight: '600',
  },
  thumbRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  thumb: {
    width: 80,
    height: 80,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.background.tertiary,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
