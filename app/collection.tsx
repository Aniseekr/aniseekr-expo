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
import { CollectionHeader } from '../components/collection/CollectionHeader';
import { FolderList } from '../components/collection/FolderList';
import { CollectionFolder } from '../types';
import { collectionService } from '../libs/services/collection/collection-service';
import { CreateFolderModal } from '../components/collection/CreateFolderModal';
import { useRouter } from 'expo-router';

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

  const handleDelete = useCallback(async (id: string) => {
    try {
      await collectionService.deleteFolder(id);
      loadCollection();
    } catch (error) {
      console.error('Failed to delete folder:', error);
    }
  }, []);

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

  const renderFolder = useCallback(({ item }: { item: CollectionFolder }) => {
    return (
      <FolderList
        folders={[item]}
        folderPreviews={{}}
        onFolderPress={(folder) => router.push(`/collection/${folder.id}?name=${folder.name}`)}
      />
    );
  }, []);

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
      <LinearGradient colors={['#121212', '#1E1E1E']} style={StyleSheet.absoluteFill} />
      <View style={styles.container}>
        <CollectionHeader
          categories={categories}
          selectedCategory={selectedCategory}
          categoryCounts={categoryCounts}
          categoryIcons={categoryIcons}
          onSelectCategory={setSelectedCategory}
          onAddFolder={() => setCreateModalVisible(true)}
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

  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  sortContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 8,
  },

  sortButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    marginBottom: 8,
  },

  sortButtonActive: {
    backgroundColor: 'rgba(251, 191, 36, 1)',
    borderColor: '#fff',
  },

  sortButtonText: {
    fontSize: 12,
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
