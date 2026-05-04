import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Image,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { collectionService } from '../../libs/services/collection/collection-service';
import { LocalDB } from '../../libs/db';
import { LinearGradient } from 'expo-linear-gradient';
import { NearbyPilgrimageBadge } from '../../components/pilgrimage/NearbyPilgrimageBadge';
import {
  AnimeProgressView,
  type AnimeProgress,
} from '../../components/collection/AnimeProgressView';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

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
  const [editingItem, setEditingItem] = useState<FolderItem | null>(null);
  const router = useRouter();

  const loadItems = useCallback(async () => {
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
  }, [id]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleSaveProgress = async (animeId: string, progress: AnimeProgress) => {
    try {
      const db = await LocalDB.getDatabase();
      const now = Date.now();
      await db.runAsync(
        `INSERT INTO user_anime (
            anime_id, status, score, progress, total_episodes, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(anime_id) DO UPDATE SET
            status = excluded.status,
            score = excluded.score,
            progress = excluded.progress,
            total_episodes = excluded.total_episodes,
            updated_at = excluded.updated_at`,
        animeId,
        progress.status,
        Math.round(progress.score * 10),
        progress.episodesWatched,
        progress.totalEpisodes ?? null,
        now
      );
      await loadItems();
    } catch (error) {
      console.error('Failed to save progress:', error);
    }
  };

  const renderItem = ({ item }: { item: FolderItem }) => (
    <Pressable
      style={({ pressed }) => [styles.itemContainer, pressed && styles.itemContainerPressed]}
      onPress={() => {
        hapticsBridge.tap();
        setEditingItem(item);
      }}
      onLongPress={() => {
        hapticsBridge.longPress();
        router.push(`/(rate)/anime/${item.id}`);
      }}
      delayLongPress={350}>
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
        <View style={styles.badgeRow}>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
          <NearbyPilgrimageBadge
            sourcePlatform="anilist"
            id={item.id}
            onPress={(data) => router.push(`/pilgrimage/${data.id}`)}
          />
        </View>
      </View>
    </Pressable>
  );

  const normalizeStatus = (raw: string): AnimeProgress['status'] => {
    const v = (raw || '').toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
    if (
      v === 'watching' ||
      v === 'completed' ||
      v === 'on_hold' ||
      v === 'dropped' ||
      v === 'planning' ||
      v === 'rewatching'
    ) {
      return v as AnimeProgress['status'];
    }
    if (v === 'plan_to_watch' || v === 'plan') return 'planning';
    if (v === 'paused') return 'on_hold';
    return 'planning';
  };

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

        <AnimeProgressView
          visible={!!editingItem}
          animeTitle={editingItem?.title ?? ''}
          totalEpisodes={editingItem?.total_episodes || undefined}
          progress={
            editingItem
              ? {
                  status: normalizeStatus(editingItem.status),
                  score: (editingItem.score ?? 0) / 10,
                  episodesWatched: editingItem.progress ?? 0,
                  totalEpisodes: editingItem.total_episodes || undefined,
                  rewatchCount: 0,
                  notes: '',
                }
              : undefined
          }
          onClose={() => setEditingItem(null)}
          onSave={(next) => {
            if (!editingItem) return;
            handleSaveProgress(editingItem.id, next);
          }}
        />
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
  itemContainerPressed: {
    opacity: 0.8,
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
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
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
