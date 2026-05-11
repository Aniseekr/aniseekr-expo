import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { ThemedText } from '../themed';

export interface RecentRailItem {
  id: string;
  title: string;
  imageUrl?: string;
}

interface CollectionRecentRailProps {
  title?: string;
  items: RecentRailItem[];
  onPressItem?: (item: RecentRailItem) => void;
  onPressSeeAll?: () => void;
}

function CollectionRecentRailComponent({
  title = 'Recently Viewed',
  items,
  onPressItem,
  onPressSeeAll,
}: CollectionRecentRailProps) {
  const { theme } = useTheme();

  if (!items || items.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <ThemedText variant="titleMedium" weight="700">
          {title}
        </ThemedText>
        {onPressSeeAll ? (
          <Pressable onPress={onPressSeeAll} hitSlop={8}>
            <ThemedText variant="captionSmall" tone="secondary" weight="600">
              See all
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}>
        {items.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => {
              hapticsBridge.tap();
              onPressItem?.(item);
            }}
            style={({ pressed }) => [styles.cell, { opacity: pressed ? 0.85 : 1 }]}>
            <View
              style={[
                styles.cover,
                { backgroundColor: theme.background.tertiary, borderColor: theme.glassBorder },
              ]}>
              {item.imageUrl ? (
                <Image
                  source={{ uri: item.imageUrl }}
                  style={styles.coverImage}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.coverFallback}>
                  <MaterialIcons name="image" size={20} color={theme.text.tertiary} />
                </View>
              )}
            </View>
            <ThemedText
              variant="captionSmall"
              weight="600"
              numberOfLines={2}
              style={styles.title}>
              {item.title}
            </ThemedText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rail: {
    gap: 10,
    paddingRight: Spacing.xs,
  },
  cell: {
    width: 90,
    gap: 6,
  },
  cover: {
    width: 90,
    height: 104,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 11,
    lineHeight: 14,
  },
});

export const CollectionRecentRail = memo(CollectionRecentRailComponent);
