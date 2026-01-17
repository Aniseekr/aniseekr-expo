import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collectionService } from '../../libs/services/collection/collection-service';
import { LocalDB } from '../../libs/db';
import { AnimatedPressable } from '../../components/common/AnimatedPressable';
import { LinearGradient } from 'expo-linear-gradient';

interface FolderItem {
  id: string;
  title: string;
  image_url: string;
  progress: number;
  total_episodes: number;
  status: string;
  score: number;
}

export default function FolderDetailScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const [items, setItems] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadItems();
  }, [id]);

  const loadItems = async () => {
    setLoading(true);
    try {
      if (!id) return;
      const animeIds = await collectionService.getFolderItems(id);
      const db = await LocalDB.getDatabase();

      const loadedItems: FolderItem[] = [];

      for (const animeId of animeIds) {
        const row = await db.getFirstAsync<{
          anime_id: string;
          title: string;
          image_url: string;
          progress: number;
          total_episodes: number;
          status: string;
          score: number;
        }>('SELECT * FROM user_anime WHERE anime_id = ?', animeId);

        if (row) {
          loadedItems.push({
            id: row.anime_id,
            title: row.title || 'Unknown Title',
            image_url: row.image_url,
            progress: row.progress || 0,
            total_episodes: row.total_episodes || 0,
            status: row.status,
            score: row.score,
          });
        }
      }
      setItems(loadedItems);
    } catch (error) {
      console.error('Failed to load folder items:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: FolderItem }) => (
    <AnimatedPressable
      style={styles.itemContainer}
      onPress={() => router.push(`/(rate)/anime/${item.id}`)}>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.itemImage} />
      ) : (
        <View style={styles.itemImage} />
      )}
      <View style={styles.itemContent}>
        <Text style={styles.itemTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.itemSubtitle}>
          {item.progress} / {item.total_episodes || '?'} EP
        </Text>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
    </AnimatedPressable>
  );

  return (
    <>
      <Stack.Screen options={{ title: name || 'Folder', headerLargeTitle: false }} />
      <View style={styles.container}>
        <LinearGradient colors={['#121212', '#1E1E1E']} style={StyleSheet.absoluteFill} />
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3b82f6" />
          </View>
        ) : (
          <FlatList
            data={items}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No items in this folder</Text>
              </View>
            }
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  itemContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    padding: 8,
  },
  itemImage: {
    width: 60,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#2E2E2E',
  },
  itemContent: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  itemTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemSubtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    marginBottom: 6,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 16,
  },
});
