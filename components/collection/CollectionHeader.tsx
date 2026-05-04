import { View, Text, ScrollView, Pressable, Platform, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

interface CollectionHeaderProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  categoryCounts: { [key: string]: number };
  categoryIcons?: Record<string, string>;
  onAddFolder?: () => void;
  onPressSearch?: () => void;
}

export function CollectionHeader({
  categories,
  selectedCategory,
  onSelectCategory,
  categoryCounts,
  categoryIcons,
  onAddFolder,
  onPressSearch,
}: CollectionHeaderProps) {
  const handleSearchPress = () => {
    hapticsBridge.tap();
    onPressSearch?.();
  };

  const handleAddPress = () => {
    hapticsBridge.tap();
    onAddFolder?.();
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <View style={styles.iconContainer}>
            <MaterialIcons name="collections" size={24} color={Colors.text.primary} />
          </View>
          <Text style={styles.title}>Collector</Text>
        </View>
        <View style={styles.actionsRow}>
          <Pressable
            style={styles.actionButton}
            onPress={handleSearchPress}
            accessibilityRole="button"
            accessibilityLabel="Search collection">
            <MaterialIcons name="search" size={22} color={Colors.text.primary} />
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={handleAddPress}
            accessibilityRole="button"
            accessibilityLabel="Add folder">
            <MaterialIcons name="add" size={24} color={Colors.text.primary} />
          </Pressable>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesContainer}>
        {categories.map((category) => {
          const count = categoryCounts[category] || 0;
          const isSelected = selectedCategory === category;
          return (
            <Pressable
              key={category}
              onPress={() => onSelectCategory(category)}
              style={[styles.categoryButton, isSelected && styles.categoryButtonActive]}>
              <View style={styles.categoryContent}>
                <Text style={[styles.categoryText, isSelected && styles.categoryTextActive]}>
                  {category}
                </Text>
                {count > 0 && (
                  <View style={[styles.countBadge, isSelected && styles.countBadgeActive]}>
                    <Text style={[styles.countText, isSelected && styles.countTextActive]}>
                      {count}
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.glass.medium,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        backgroundColor: Colors.background.secondary,
        elevation: 2,
      },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.glass.light,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: {
        elevation: 1,
      },
    }),
  },
  title: {
    color: Colors.text.primary,
    ...Typography.headlineMedium,
    letterSpacing: -0.5,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  actionButton: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: Colors.glass.light,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: {
        elevation: 1,
      },
    }),
  },
  categoriesContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  categoryButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: Radius.xl,
    backgroundColor: Colors.glass.light,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  categoryButtonActive: {
    backgroundColor: Colors.text.primary,
    borderColor: Colors.text.primary,
  },
  categoryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  categoryText: {
    color: Colors.text.primary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  categoryTextActive: {
    color: Colors.background.primary,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.glass.medium,
  },
  countBadgeActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  countText: {
    color: Colors.text.secondary,
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  countTextActive: {
    color: 'rgba(0, 0, 0, 0.6)',
  },
});
