import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { ProgressiveImage } from '../common/ProgressiveImage';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

export interface RecentItem {
  id: string;
  title: string;
  imageUrl?: string;
  visitedAt?: Date | string;
  episode?: number;
}

interface RecentlyViewedSectionProps {
  items: RecentItem[];
  title?: string;
  emptyHint?: string;
  onItemPress?: (item: RecentItem) => void;
}

function formatRelative(date?: Date | string): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.max(1, Math.floor((Date.now() - d.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return d.toLocaleDateString();
}

function RecentlyViewedSectionComponent({
  items,
  title = 'Recently viewed',
  emptyHint = 'Your recent picks will appear here.',
  onItemPress,
}: RecentlyViewedSectionProps) {
  const router = useRouter();
  const { theme } = useTheme();

  if (!items || items.length === 0) {
    return (
      <View style={styles.section}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: theme.text.primary }]}>{title}</Text>
        </View>
        <Text style={[styles.empty, { color: theme.text.tertiary }]}>{emptyHint}</Text>
      </View>
    );
  }

  const handlePress = (item: RecentItem) => {
    hapticsBridge.tap();
    if (onItemPress) onItemPress(item);
    else router.push(`/(rate)/anime/${item.id}`);
  };

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <MaterialIcons name="history" size={18} color={theme.accent} />
          <Text style={[styles.title, { color: theme.text.primary }]}>{title}</Text>
        </View>
        <Text style={[styles.count, { color: theme.text.tertiary }]}>{items.length}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>
        {items.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => handlePress(item)}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: theme.background.secondary,
                borderColor: theme.glassBorder,
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            <ProgressiveImage
              source={
                item.imageUrl
                  ? { uri: item.imageUrl }
                  : { uri: 'https://placehold.co/120x160/1c1c1e/666?text=?' }
              }
              containerStyle={styles.thumb}
              borderRadius={14}
            />
            <View style={styles.body}>
              <Text style={[styles.cardTitle, { color: theme.text.primary }]} numberOfLines={2}>
                {item.title}
              </Text>
              {item.episode ? (
                <Text style={[styles.episode, { color: theme.accent }]}>Ep {item.episode}</Text>
              ) : null}
              <Text style={[styles.time, { color: theme.text.tertiary }]}>
                {formatRelative(item.visitedAt)}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginVertical: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    ...Typography.titleLarge,
  },
  count: {
    ...Typography.titleSmall,
  },
  empty: {
    ...Typography.bodySmall,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  scroll: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  card: {
    width: 130,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumb: {
    width: 130,
    height: 175,
  },
  body: {
    padding: Spacing.xs + 2,
    gap: 2,
  },
  cardTitle: {
    ...Typography.titleSmall,
  },
  episode: {
    ...Typography.captionSmall,
    fontWeight: '700',
  },
  time: {
    ...Typography.captionSmall,
  },
});

export const RecentlyViewedSection = memo(RecentlyViewedSectionComponent);
