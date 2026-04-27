import {
  View,
  FlatList,
  RefreshControl,
  Platform,
  StyleSheet,
  TouchableOpacity,
  Text,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { CollectionHeader } from '../components/collection/CollectionHeader';
import { FolderList } from '../components/collection/FolderList';
import { CollectionOverviewCard } from '../components/collection/CollectionOverviewCard';
import { CollectionFolder } from '../types';
import { collectionService } from '../libs/services/collection/collection-service';
import { CreateFolderModal } from '../components/collection/CreateFolderModal';
import { Colors, FontFamily, Radius, Spacing, Typography } from '../constants/DesignSystem';

type SortMode = 'newest' | 'oldest' | 'rarity' | 'popularity' | 'count' | 'id';

export default function CollectionScreen() {
  const { top } = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [collections, setCollections] = useState<CollectionFolder[]>([]);
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const router = useRouter();

  const categories = ['All', 'Wishlist', 'Favorites', 'Watching', 'Completed', 'Dropped'];
  const categoryIcons: Record<string, string> = {
    All: 'bookmark',
    Wishlist: 'heart',
    Favorites: 'heart',
    Watching: 'play-circle',
    Completed: 'checkmark-circle',
    Dropped: 'x-circle',
  };

  const loadCollection = async () => {
    try {
      const data = await collectionService.getFolders();
      setCollections(data);
    } catch (error) {
      console.error('Failed to load collection:', error);
    }
  };

  useEffect(() => {
    loadCollection();
  }, []);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    collections.forEach((folder) => {
      if (folder.name === 'All') counts['All'] = folder.animeCount;
      if (folder.name === 'Favorites') counts['Favorites'] = folder.animeCount;
      if (folder.name === 'Watching') counts['Watching'] = folder.animeCount;
      if (folder.name === 'Completed') counts['Completed'] = folder.animeCount;
      if (folder.name === 'Dropped') counts['Dropped'] = folder.animeCount;
      if (folder.name === 'Plan to Watch') counts['Wishlist'] = folder.animeCount;
    });
    return counts;
  }, [collections]);

  const overviewStats = useMemo(
    () =>
      [
        {
          label: 'Total',
          value: collections.reduce((acc, f) => acc + (f.animeCount || 0), 0),
          icon: 'collections-bookmark' as const,
          color: Colors.primary,
        },
        {
          label: 'Watching',
          value: categoryCounts.Watching ?? 0,
          icon: 'play-circle-filled' as const,
          color: Colors.success,
        },
        {
          label: 'Done',
          value: categoryCounts.Completed ?? 0,
          icon: 'check-circle' as const,
          color: Colors.info,
        },
        {
          label: 'Wishlist',
          value: categoryCounts.Wishlist ?? 0,
          icon: 'favorite' as const,
          color: Colors.error,
        },
      ],
    [categoryCounts, collections]
  );

  const recentItems = useMemo(
    () =>
      [...collections]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 3)
        .map((f) => ({ id: f.id, imageUrl: undefined as string | undefined })),
    [collections]
  );

  const handleSort = useCallback((mode: SortMode) => {
    setSortMode(mode);
  }, []);

  const filteredCollections = useMemo(() => {
    let filtered = collections;

    if (selectedCategory !== 'All') {
      const targetTypeMap: Record<string, string> = {
        Wishlist: 'wishlist',
        Favorites: 'favorites',
        Watching: 'watching',
        Completed: 'completed',
        Dropped: 'dropped',
      };
      const targetType = targetTypeMap[selectedCategory];

      if (targetType) {
        filtered = collections.filter((f) => f.folderType === targetType);
      }
    }

    return [...filtered].sort((a, b) => {
      if (sortMode === 'newest') return b.createdAt.getTime() - a.createdAt.getTime();
      if (sortMode === 'oldest') return a.createdAt.getTime() - b.createdAt.getTime();
      if (sortMode === 'rarity') return (b.isR18 ? 1 : 0) - (a.isR18 ? 1 : 0);
      if (sortMode === 'popularity') return b.sharedBy - a.sharedBy;
      if (sortMode === 'count') return b.animeCount - a.animeCount;
      if (sortMode === 'id') return a.id.localeCompare(b.id);
      return 0;
    });
  }, [collections, selectedCategory, sortMode]);

  const renderFolder = useCallback(
    ({ item }: { item: CollectionFolder }) => (
      <FolderList
        folders={[item]}
        folderPreviews={{}}
        onFolderPress={(folder) =>
          router.push(`/collection/${folder.id}?name=${folder.name}`)
        }
      />
    ),
    [router]
  );

  const keyExtractor = useCallback((item: CollectionFolder) => item.id, []);

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>📁</Text>
      <Text style={styles.emptyText}>Your collection is empty</Text>
      <Text style={styles.emptySubtext}>Start adding anime to build your collection</Text>
    </View>
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadCollection().then(() => {
      setRefreshing(false);
    });
  }, []);

  const renderSortButtons = () => {
    const sortOptions: { label: string; value: SortMode }[] = [
      { label: 'Newest', value: 'newest' },
      { label: 'Oldest', value: 'oldest' },
      { label: 'Rarity', value: 'rarity' },
      { label: 'Popularity', value: 'popularity' },
      { label: 'Count', value: 'count' },
      { label: 'ID', value: 'id' },
    ];

    return (
      <View style={styles.sortContainer}>
        {sortOptions.map((option) => {
          const isActive = sortMode === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => handleSort(option.value)}
              style={[styles.sortButton, isActive && styles.sortButtonActive]}>
              <Text style={[styles.sortButtonText, isActive && styles.sortButtonTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const flatListRef = useRef<FlatList>(null);

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: top }]}>
      <LinearGradient
        colors={Colors.gradients.background as [string, string, ...string[]]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowOrange} pointerEvents="none" />
      <View style={styles.container}>
        <CollectionHeader
          categories={categories}
          selectedCategory={selectedCategory}
          categoryCounts={categoryCounts}
          categoryIcons={categoryIcons}
          onSelectCategory={setSelectedCategory}
          onAddFolder={() => setCreateModalVisible(true)}
        />

        <CollectionOverviewCard
          stats={overviewStats}
          recents={recentItems}
          onViewAll={() => setSelectedCategory('All')}
        />

        {selectedCategory !== 'All' && renderSortButtons()}

        <FlatList
          ref={flatListRef}
          data={filteredCollections}
          renderItem={renderFolder}
          keyExtractor={keyExtractor}
          ListEmptyComponent={renderEmptyState}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              tintColor={Colors.text.primary}
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.primary]}
              progressBackgroundColor={Colors.background.secondary}
            />
          }
          removeClippedSubviews={Platform.OS === 'android'}
          maxToRenderPerBatch={10}
          windowSize={5}
          updateCellsBatchingPeriod={50}
          initialNumToRender={10}
          scrollEventThrottle={16}
        />

        <CreateFolderModal
          visible={isCreateModalVisible}
          onClose={() => setCreateModalVisible(false)}
          onCreated={loadCollection}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  glowOrange: {
    position: 'absolute',
    top: -100,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: `${Colors.primary}26`,
    opacity: 0.5,
  },
  listContent: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: 120,
  },
  sortContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginHorizontal: Spacing.screenPadding,
    marginBottom: Spacing.md,
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  sortButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.chipLg,
    backgroundColor: Colors.glass.light,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    marginBottom: Spacing.xs,
  },
  sortButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  sortButtonText: {
    ...Typography.bodySmall,
    fontFamily: FontFamily.text,
    fontWeight: '600',
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  sortButtonTextActive: {
    color: '#000',
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: Spacing.md,
  },
  emptyText: {
    ...Typography.headlineSmall,
    color: Colors.text.primary,
    fontFamily: FontFamily.rounded,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  emptySubtext: {
    ...Typography.bodyLarge,
    color: Colors.text.secondary,
    fontFamily: FontFamily.text,
    textAlign: 'center',
  },
  separator: {
    height: 1,
    backgroundColor: Colors.glass.border,
  },
});
