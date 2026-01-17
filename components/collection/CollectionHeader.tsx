import { View, Text, ScrollView, Pressable, Platform, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface CollectionHeaderProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  categoryCounts: { [key: string]: number };
  categoryIcons?: Record<string, string>;
  onAddFolder?: () => void;
}

export function CollectionHeader({
  categories,
  selectedCategory,
  onSelectCategory,
  categoryCounts,
  categoryIcons,
  onAddFolder,
}: CollectionHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <View style={styles.iconContainer}>
            <MaterialIcons name="collections" size={24} color="rgba(255, 255, 255, 0.87)" />
          </View>
          <Text style={styles.title}>Collector</Text>
        </View>
        <View style={styles.actionsRow}>
          <Pressable style={styles.actionButton}>
            <MaterialIcons name="search" size={22} color="rgba(255, 255, 255, 0.87)" />
          </Pressable>
          <Pressable style={styles.actionButton} onPress={onAddFolder}>
            <MaterialIcons name="add" size={24} color="rgba(255, 255, 255, 0.87)" />
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
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        backgroundColor: '#1E1E1E',
        elevation: 2,
      },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: {
        elevation: 1,
      },
    }),
  },
  title: {
    color: 'rgba(255, 255, 255, 0.87)',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
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
    gap: 12,
  },
  categoryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  categoryButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: 'rgba(255, 255, 255, 0.95)',
  },
  categoryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryText: {
    color: 'rgba(255, 255, 255, 0.87)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  categoryTextActive: {
    color: '#121212',
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  countBadgeActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  countText: {
    color: 'rgba(255, 255, 255, 0.6)',
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
