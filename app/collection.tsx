import { View, FlatList, RefreshControl, Platform, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback, useMemo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { CollectionHeader } from '../components/collection/CollectionHeader';
import { FolderList, CollectionFolder, AnimePreview } from '../components/collection/FolderList';
import { AnimeRepository } from '../libs/repositories/anime-repository';

interface CollectionFolder {
  id: string;
  name: string;
  icon: string;
  isR18: boolean;
  isShared: boolean;
  isSystemFolder: boolean;
  folderType: 'all' | null;
}

type SortMode = 'newest' | 'oldest' | 'rarity' | 'popularity' | 'count' | 'id';

export default function CollectionScreen() {
  const { top } = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortMode, setSortMode] = useState<SortMode>('newest');

  const categories = ['All', 'Wishlist', 'Favorites', 'Watching', 'Completed', 'Dropped'];
  const categoryIcons: Record<string, string> = {
    All: 'bookmark',
    Wishlist: 'heart',
    Favorites: 'heart',
    Watching: 'play-circle',
    Completed: 'check-circle',
    Dropped: 'x-circle',
  };

  const categoryCounts: Record<string, number> = {
    All: 156,
    Wishlist: 42,
    Favorites: 12,
    Watching: 8,
    Completed: 85,
    Dropped: 14,
  };

  const folders: CollectionFolder[] = [
    {
      id: '1',
      name: 'Wishlist',
      icon: 'bookmark',
      isR18: false,
      isShared: true,
      isSystemFolder: true,
      folderType: null,
    },
    {
      id: '2',
      name: 'Watching',
      icon: 'play-circle',
      isR18: false,
      isShared: true,
      isSystemFolder: true,
      folderType: 'all',
    },
    {
      id: '3',
      name: 'Favorites',
      icon: 'heart',
      isR18: false,
      isShared: true,
      isSystemFolder: true,
      folderType: 'all',
    },
    {
      id: '4',
      name: 'Summer 2024',
      icon: 'folder',
      isR18: false,
      isShared: true,
      isSystemFolder: false,
      folderType: 'all',
    },
  ];

  const [collections, setCollections] = useState<CollectionFolder[]>(folders);

  const loadCollection = async () => {
    const data = await AnimeRepository.getCollection();
    setCollections(data);
  };

  const handleDelete = useCallback((id: string) => {
    setCollections((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleSort = useCallback((mode: SortMode) => {
    setSortMode(mode);
  }, []);

  const sortedCollections = useMemo(() => {
    if (sortMode === 'newest') {
      return [...collections].reverse();
    } else if (sortMode === 'oldest') {
      return [...collections];
    } else if (sortMode === 'rarity') {
      return [...collections].sort((a, b) => {
        if (a.isR18 !== b.isR18) return a.isR18 ? -1 : 1;
        return 0;
      });
    } else if (sortMode === 'popularity') {
      return [...collections].sort((a, b) => b.id.localeCompare(a.id));
    } else if (sortMode === 'count') {
      return [...collections].sort((a, b) => b.id.localeCompare(a.id));
    }
    return collections;
  }, [collections, sortMode]);

  const renderFolder = useCallback(
    ({ item }: { item: CollectionFolder }) => {
      return (
        <FolderList
          folder={item}
          onDelete={handleDelete}
          onSwipe={(direction, id) => {
            if (direction === 'right') {
              handleDelete(id);
            }
          }}
          folderPreviews={[]}
          isLast={false}
          isExpanded={false}
          isFirst={false}
          onToggle={() => {}}
          onPress={() => {}}
          onLongPress={() => {}}
        />
      );
    },
    [handleDelete]
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
            <View
              key={option.value}
              style={[styles.sortButton, isActive && styles.sortButtonActive]}>
              <Text style={[styles.sortButtonText, isActive && styles.sortButtonTextActive]}>
                {option.label}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  const filteredCollections = useMemo(() => {
    if (selectedCategory === 'All') {
      return sortedCollections;
    }

    const categoryFolders = collections.filter(
      (folder) => folder.icon === categoryIcons[selectedCategory]
    );

    return categoryFolders;
  }, [sortedCollections, collections, selectedCategory]);

  const flatListRef = useRef<FlatList>(null);

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: top }]}>
      <LinearGradient colors={['#121212', '#1E1E1E']} style={StyleSheet.absoluteFill} />
      <View style={styles.container}>
        <CollectionHeader
          categories={categories}
          selectedCategory={selectedCategory}
          categoryCounts={categoryCounts}
          categoryIcons={categoryIcons}
          onSelectCategory={setSelectedCategory}
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
              tintColor="#fff"
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#6200EE']}
              progressBackgroundColor="#6200EE"
            />
          }
          onEndReached={() => {}}
          removeClippedSubviews={Platform.OS === 'android'}
          maxToRenderPerBatch={10}
          windowSize={5}
          updateCellsBatchingPeriod={50}
          initialNumToRender={10}
          scrollEventThrottle={16}
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

  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  headerContainer: {
    marginBottom: 8,
  },

  sortContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginBottom: 16,
  },

  sortButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },

  sortButtonActive: {
    backgroundColor: 'rgba(251, 191, 36, 1)',
    borderColor: '#fff',
  },

  sortButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },

  sortButtonTextActive: {
    color: '#fff',
    fontWeight: '700',
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },

  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },

  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },

  emptySubtext: {
    fontSize: 16,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
  },

  separator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
});
