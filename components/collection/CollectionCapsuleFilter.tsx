import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

export type CollectionFilterKey =
  | 'all'
  | 'watching'
  | 'completed'
  | 'wishlist'
  | 'favorites'
  | 'dropped'
  | 'unrated';

interface FilterDefinition {
  key: CollectionFilterKey;
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
}

export const COLLECTION_FILTERS: FilterDefinition[] = [
  { key: 'all', label: 'All', icon: 'apps' },
  { key: 'watching', label: 'Watching', icon: 'play-circle-filled' },
  { key: 'completed', label: 'Completed', icon: 'check-circle' },
  { key: 'wishlist', label: 'Wishlist', icon: 'bookmark' },
  { key: 'favorites', label: 'Favorites', icon: 'favorite' },
  { key: 'dropped', label: 'Dropped', icon: 'cancel' },
  { key: 'unrated', label: 'Unrated', icon: 'star-border' },
];

interface CollectionCapsuleFilterProps {
  value: CollectionFilterKey;
  onChange: (value: CollectionFilterKey) => void;
  counts?: Partial<Record<CollectionFilterKey, number>>;
  filters?: FilterDefinition[];
}

function CollectionCapsuleFilterComponent({
  value,
  onChange,
  counts = {},
  filters = COLLECTION_FILTERS,
}: CollectionCapsuleFilterProps) {
  const { theme } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}>
      {filters.map((f) => {
        const active = f.key === value;
        const count = counts[f.key];
        return (
          <Pressable
            key={f.key}
            onPress={() => {
              hapticsBridge.selection();
              onChange(f.key);
            }}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: active ? theme.accent : theme.background.secondary,
                borderColor: active ? theme.accent : theme.glassBorder,
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            <MaterialIcons
              name={f.icon}
              size={16}
              color={active ? '#0E0A06' : theme.text.secondary}
            />
            <Text style={[styles.label, { color: active ? '#0E0A06' : theme.text.primary }]}>
              {f.label}
            </Text>
            {typeof count === 'number' ? (
              <View
                style={[
                  styles.countBadge,
                  {
                    backgroundColor: active ? '#0E0A0626' : theme.background.tertiary,
                  },
                ]}>
                <Text
                  style={[styles.countText, { color: active ? '#0E0A06' : theme.text.secondary }]}>
                  {count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
    paddingVertical: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
  },
  label: {
    ...Typography.titleSmall,
    fontWeight: '600',
  },
  countBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    ...Typography.captionSmall,
    fontWeight: '700',
  },
});

export const CollectionCapsuleFilter = memo(CollectionCapsuleFilterComponent);
