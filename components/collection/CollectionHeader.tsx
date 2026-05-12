import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { ThemedIconButton, ThemedText, readableTextOn } from '../themed';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

interface CollectionHeaderProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  categoryCounts: { [key: string]: number };
  /** Total anime count, shown in subtitle. */
  totalAnime?: number;
  /** Number of user-visible folders (favorites + custom), shown in subtitle. */
  folderCount?: number;
  /** Cloud-upload action (enters share mode in design). */
  onPressShare?: () => void;
  /** Plus action (create folder). */
  onAddFolder?: () => void;
  /** Optional search shortcut, rendered as a small glass button. */
  onPressSearch?: () => void;
}

function CollectionHeaderComponent({
  categories,
  selectedCategory,
  onSelectCategory,
  categoryCounts,
  totalAnime,
  folderCount,
  onPressShare,
  onAddFolder,
  onPressSearch,
}: CollectionHeaderProps) {
  const { theme } = useTheme();
  const onAccent = readableTextOn(theme.accent);
  const hasMeta = totalAnime !== undefined || folderCount !== undefined;
  const metaParts = [
    totalAnime !== undefined ? `${totalAnime} anime` : null,
    folderCount !== undefined
      ? `${folderCount} ${folderCount === 1 ? 'folder' : 'folders'}`
      : null,
  ].filter(Boolean) as string[];

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <ThemedText variant="headlineLarge" weight="800" style={styles.title}>
            Collection
          </ThemedText>
          <ThemedText variant="bodySmall" tone="secondary" style={styles.subtitle}>
            Your saved anime library
          </ThemedText>
          {hasMeta ? (
            <ThemedText variant="captionSmall" tone="tertiary" style={styles.metaLine}>
              {metaParts.join(' · ')}
            </ThemedText>
          ) : null}
        </View>
        <View style={styles.actionsRow}>
          {onPressSearch ? (
            <ThemedIconButton
              accessibilityLabel="Search collection"
              variant="glass"
              size={36}
              onPress={onPressSearch}
              icon={(c) => <MaterialIcons name="search" size={18} color={c} />}
            />
          ) : null}
          {onPressShare ? (
            <ThemedIconButton
              accessibilityLabel="Share collection"
              variant="glass"
              size={36}
              onPress={onPressShare}
              icon={() => (
                <MaterialIcons name="cloud-upload" size={18} color={theme.accent} />
              )}
            />
          ) : null}
          {onAddFolder ? (
            <ThemedIconButton
              accessibilityLabel="Add folder"
              variant="solid"
              size={36}
              accent={theme.accent}
              onPress={onAddFolder}
              icon={() => <MaterialIcons name="create-new-folder" size={18} color={onAccent} />}
            />
          ) : null}
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesContainer}>
        {categories.map((category) => {
          const count = categoryCounts[category] || 0;
          const isSelected = selectedCategory === category;
          const bg = isSelected ? theme.accent : theme.background.secondary;
          const border = isSelected ? theme.accent : theme.glassBorder;
          const labelColor = isSelected ? onAccent : theme.text.secondary;
          return (
            <Pressable
              key={category}
              onPress={() => {
                hapticsBridge.selection();
                onSelectCategory(category);
              }}
              style={[
                styles.categoryButton,
                { backgroundColor: bg, borderColor: border },
              ]}>
              <View style={styles.categoryContent}>
                <ThemedText
                  variant="bodySmall"
                  weight={isSelected ? '700' : '500'}
                  style={{ color: labelColor }}>
                  {category}
                </ThemedText>
                {count > 0 && !isSelected ? (
                  <ThemedText variant="captionSmall" tone="tertiary" weight="600">
                    {count}
                  </ThemedText>
                ) : null}
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
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...Typography.headlineLarge,
    letterSpacing: -0.5,
  },
  subtitle: {
    letterSpacing: 0.1,
  },
  metaLine: {
    marginTop: 2,
    letterSpacing: 0.1,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  categoriesContainer: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingVertical: 2,
  },
  categoryButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
  },
  categoryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});

export const CollectionHeader = memo(CollectionHeaderComponent);
