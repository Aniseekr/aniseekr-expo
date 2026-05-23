import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { collectionService } from '../../../libs/services/collection/collection-service';
import { pushAnimeDetail } from '../../../libs/utils/navigate-to-anime';
import { trackingService } from '../../../libs/services/tracking/tracking-service';
import { UserRepository } from '../../../libs/repositories/user-repository';
import type { PlatformType } from '../../../libs/services/auth/types';
import { LocalDB } from '../../../libs/db';
import { NearbyPilgrimageBadge } from '../../../components/pilgrimage/NearbyPilgrimageBadge';
import {
  AnimeProgressView,
  type AnimeProgress,
} from '../../../components/collection/AnimeProgressView';
import { FolderSwipeDeck } from '../../../components/collection/FolderSwipeDeck';
import { Skeleton, ThemedText } from '../../../components/themed';
import { useTheme } from '../../../context/ThemeContext';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';

interface FolderItem {
  id: string;
  title: string;
  image_url: string;
  progress: number;
  total_episodes: number;
  status: string;
  score: number;
  notes: string;
  rewatch_count: number;
}

// Sync mirror so re-entering a folder paints frame 1 from memory instead of
// awaiting SQLite. Populated on every successful load. See CLAUDE.md Rule 10.
const folderSnapshotCache = new Map<string, FolderItem[]>();

function ProgressBar({
  progress,
  indeterminate,
  color,
  trackColor,
}: {
  progress: number;
  indeterminate?: boolean;
  color: string;
  trackColor: string;
}) {
  const pct = Math.max(0, Math.min(1, progress));
  return (
    <View style={[styles.progressTrack, { backgroundColor: trackColor }]}>
      <View
        style={[
          styles.progressFill,
          indeterminate
            ? { backgroundColor: color, width: '35%', opacity: 0.4 }
            : { backgroundColor: color, width: `${pct * 100}%` },
        ]}
      />
    </View>
  );
}

export default function FolderDetailScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  // Rule 10: seed from the sync snapshot so the grid is on screen frame 1.
  const initialItems = id ? folderSnapshotCache.get(id) ?? [] : [];
  const [items, setItems] = useState<FolderItem[]>(initialItems);
  const [loading, setLoading] = useState(initialItems.length === 0);
  const [editingItem, setEditingItem] = useState<FolderItem | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'swipe'>('list');

  const loadItems = useCallback(async () => {
    // Only flip the blocking skeleton when we have nothing to render. Warm
    // re-entries revalidate silently.
    if (!folderSnapshotCache.has(id ?? '')) setLoading(true);
    try {
      if (!id) return;
      const db = await LocalDB.getDatabase();

      // Favorites live in their own table and may not have a user_anime row.
      // Load them directly so the folder isn't empty when nothing is tracked.
      if (id === 'system_favorites') {
        const favRows = await db.getAllAsync<{
          id: string;
          title: string | null;
          image: string | null;
        }>('SELECT id, title, image FROM favorites ORDER BY addedAt DESC');

        let trackingMap = new Map<
          string,
          {
            progress: number;
            total_episodes: number;
            status: string;
            score: number;
            notes: string | null;
            rewatch_count: number | null;
          }
        >();
        if (favRows.length > 0) {
          const placeholders = favRows.map(() => '?').join(',');
          const trackingRows = await db.getAllAsync<{
            anime_id: string;
            progress: number;
            total_episodes: number;
            status: string;
            score: number;
            notes: string | null;
            rewatch_count: number | null;
          }>(
            `SELECT anime_id, progress, total_episodes, status, score, notes, rewatch_count
               FROM user_anime
              WHERE anime_id IN (${placeholders})`,
            ...favRows.map((r) => r.id)
          );
          trackingMap = new Map(trackingRows.map((t) => [t.anime_id, t]));
        }

        const mapped = favRows.map((r) => {
          const t = trackingMap.get(r.id);
          return {
            id: r.id,
            title: r.title || 'Unknown Title',
            image_url: r.image || '',
            progress: t?.progress ?? 0,
            total_episodes: t?.total_episodes ?? 0,
            status: t?.status ?? 'favorites',
            score: t?.score ?? 0,
            notes: t?.notes ?? '',
            rewatch_count: t?.rewatch_count ?? 0,
          };
        });
        folderSnapshotCache.set(id, mapped);
        setItems(mapped);
        return;
      }

      const animeIds = await collectionService.getFolderItems(id);
      if (animeIds.length === 0) {
        folderSnapshotCache.set(id, []);
        setItems([]);
        return;
      }

      const placeholders = animeIds.map(() => '?').join(',');
      const rows = await db.getAllAsync<{
        anime_id: string;
        title: string;
        image_url: string;
        progress: number;
        total_episodes: number;
        status: string;
        score: number;
        notes: string | null;
        rewatch_count: number | null;
      }>(
        `SELECT anime_id, title, image_url, progress, total_episodes, status, score,
                notes, rewatch_count
           FROM user_anime
          WHERE anime_id IN (${placeholders})`,
        ...animeIds
      );
      const byId = new Map(rows.map((r) => [r.anime_id, r]));

      const loadedItems: FolderItem[] = [];
      for (const animeId of animeIds) {
        const row = byId.get(animeId);
        if (row) {
          loadedItems.push({
            id: row.anime_id,
            title: row.title || 'Unknown Title',
            image_url: row.image_url,
            progress: row.progress || 0,
            total_episodes: row.total_episodes || 0,
            status: row.status,
            score: row.score,
            notes: row.notes ?? '',
            rewatch_count: row.rewatch_count ?? 0,
          });
        }
      }
      folderSnapshotCache.set(id, loadedItems);
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

  // Refresh when returning from a child screen (e.g. anime detail) so changes
  // made there — favorite toggle, status update, score edit — propagate back
  // without a manual pull. The first focus is skipped because the useEffect
  // above already kicked off the initial load. Revalidation is silent: the
  // snapshot cache means the skeleton doesn't reappear. See CLAUDE.md Rule 10.
  const focusInitRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusInitRef.current) {
        focusInitRef.current = true;
        return;
      }
      void loadItems();
    }, [loadItems])
  );

  const handleBack = useCallback(() => {
    hapticsBridge.tap();
    // Force return to collection tab even when the back stack is empty
    // (e.g. deep link or app cold-start landing on this route).
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/collection');
    }
  }, [router]);

  const handleSaveProgress = async (animeId: string, progress: AnimeProgress) => {
    try {
      const existing = items.find((it) => it.id === animeId);
      // The service-side AnimeStatus has no 'rewatching'; map it onto
      // 'watching' and bump the rewatch counter instead.
      const isRewatching = progress.status === 'rewatching';
      const serviceStatus =
        progress.status === 'planning'
          ? 'planned'
          : isRewatching
            ? 'watching'
            : (progress.status as 'watching' | 'completed' | 'on_hold' | 'dropped');

      // Best-effort source: fall back to the user's primary platform so the
      // sync layer has at least one anchor to resolve cross-platform ids.
      const primary = UserRepository.getPrimaryPlatformSync();
      const source =
        primary && primary !== '__default__' ? (primary as PlatformType) : undefined;

      await trackingService.upsertTracking({
        animeId,
        status: serviceStatus,
        score: Math.round(progress.score * 10),
        progress: progress.episodesWatched,
        totalEpisodes: progress.totalEpisodes ?? existing?.total_episodes,
        title: existing?.title,
        imageUrl: existing?.image_url,
        notes: progress.notes,
        rewatchCount: isRewatching
          ? Math.max(1, (existing?.rewatch_count ?? 0) + 1)
          : progress.rewatchCount,
        source,
      });

      // In swipe mode keep the deck frozen — reloading items would shuffle
      // indices and could yank a card out from under the user. Items refresh
      // when they leave swipe mode.
      if (viewMode === 'list') {
        await loadItems();
      } else {
        setItems((prev) =>
          prev.map((it) =>
            it.id === animeId
              ? {
                  ...it,
                  status: serviceStatus,
                  score: Math.round(progress.score * 10),
                  progress: progress.episodesWatched,
                  total_episodes: progress.totalEpisodes ?? it.total_episodes,
                  notes: progress.notes,
                  rewatch_count: isRewatching
                    ? Math.max(1, (it.rewatch_count ?? 0) + 1)
                    : progress.rewatchCount,
                }
              : it
          )
        );
      }
    } catch (error) {
      console.error('Failed to save progress:', error);
    }
  };

  const handleHaventWatched = useCallback(
    async (item: FolderItem) => {
      try {
        await trackingService.updateStatus(item.id, 'planned', {
          title: item.title,
          imageUrl: item.image_url,
        });
        hapticsBridge.selection();
      } catch (error) {
        console.error('Failed to mark as planning:', error);
      }
    },
    []
  );

  const handleLike = useCallback(async (item: FolderItem) => {
    try {
      await LocalDB.addFavorite({
        id: item.id,
        title: item.title,
        image: item.image_url,
      });
      hapticsBridge.success();
    } catch (error) {
      console.error('Failed to like:', error);
    }
  }, []);

  const toggleViewMode = useCallback(() => {
    hapticsBridge.selection();
    setViewMode((m) => {
      const next = m === 'list' ? 'swipe' : 'list';
      // Returning to the list view refreshes counts/status after the user
      // triaged a stack — captures the swipe-side updates that we deferred.
      if (next === 'list') {
        void loadItems();
      }
      return next;
    });
  }, [loadItems]);

  const renderItem = ({ item }: { item: FolderItem }) => (
    <Pressable
      style={({ pressed }) => [
        styles.itemContainer,
        {
          backgroundColor: theme.background.secondary,
          borderColor: theme.glassBorder,
        },
        pressed && { opacity: 0.85 },
      ]}
      onPress={() => {
        hapticsBridge.tap();
        setEditingItem(item);
      }}
      onLongPress={() => {
        hapticsBridge.longPress();
        pushAnimeDetail(router, {
          id: item.id,
          title: item.title,
          image: item.image_url,
        });
      }}
      delayLongPress={350}>
      {item.image_url ? (
        <Image
          source={{ uri: item.image_url }}
          style={[styles.itemImage, { backgroundColor: theme.background.tertiary }]}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
        />
      ) : (
        <View
          style={[
            styles.itemImage,
            styles.itemImagePlaceholder,
            { backgroundColor: theme.background.tertiary },
          ]}>
          <MaterialIcons name="image" size={24} color={theme.text.tertiary} />
        </View>
      )}
      <View style={styles.itemContent}>
        <ThemedText variant="titleSmall" weight="700" numberOfLines={2}>
          {item.title}
        </ThemedText>
        <View style={styles.progressRow}>
          <ThemedText variant="captionSmall" tone="secondary" weight="600">
            {item.progress} / {item.total_episodes || '?'} EP
          </ThemedText>
          {item.total_episodes > 0 ? (
            <ThemedText variant="captionSmall" tone="tertiary" weight="600">
              {Math.min(100, Math.round((item.progress / item.total_episodes) * 100))}%
            </ThemedText>
          ) : null}
          {item.score > 0 ? (
            <View style={styles.scoreChip}>
              <MaterialIcons name="star" size={11} color={theme.accent} />
              <ThemedText
                variant="captionSmall"
                weight="700"
                style={{ color: theme.accent }}>
                {(item.score / 10).toFixed(1)}
              </ThemedText>
            </View>
          ) : null}
        </View>
        <ProgressBar
          progress={
            item.total_episodes > 0
              ? Math.min(1, item.progress / item.total_episodes)
              : 0
          }
          indeterminate={item.total_episodes === 0 && item.progress > 0}
          color={theme.accent}
          trackColor={theme.background.tertiary}
        />
        <View style={styles.badgeRow}>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: `${theme.accent}26`,
                borderColor: `${theme.accent}40`,
              },
            ]}>
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: theme.accent, textTransform: 'capitalize' }}>
              {item.status}
            </ThemedText>
          </View>
          <NearbyPilgrimageBadge
            sourcePlatform="anilist"
            id={item.id}
            onPress={(data) => router.push(`/pilgrimage/${data.id}`)}
          />
        </View>
      </View>
      <MaterialIcons
        name="chevron-right"
        size={20}
        color={theme.text.tertiary}
        style={{ alignSelf: 'center' }}
      />
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
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <LinearGradient colors={theme.gradient} style={StyleSheet.absoluteFill} />
      <View
        style={[
          styles.bgGlow,
          { backgroundColor: `${theme.accent}1A` },
        ]}
        pointerEvents="none"
      />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={handleBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [
            styles.headerBtn,
            {
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
            },
            pressed && { opacity: 0.78 },
          ]}>
          <Ionicons name="chevron-back" size={20} color={theme.text.primary} />
        </Pressable>
        <View style={styles.headerText}>
          <ThemedText variant="titleMedium" weight="700" numberOfLines={1}>
            {name || 'Folder'}
          </ThemedText>
          <ThemedText variant="captionSmall" tone="tertiary" weight="500">
            {loading
              ? 'Loading…'
              : viewMode === 'swipe'
                ? `Swipe to triage · ${items.length}`
                : `${items.length} ${items.length === 1 ? 'anime' : 'anime'}`}
          </ThemedText>
        </View>
        <Pressable
          onPress={toggleViewMode}
          hitSlop={10}
          disabled={items.length === 0 && viewMode === 'list'}
          accessibilityRole="button"
          accessibilityLabel={
            viewMode === 'swipe' ? 'Back to list view' : 'Swipe to like'
          }
          style={({ pressed }) => [
            styles.headerBtn,
            {
              backgroundColor:
                viewMode === 'swipe' ? theme.accent : theme.background.secondary,
              borderColor:
                viewMode === 'swipe' ? theme.accent : theme.glassBorder,
              opacity: items.length === 0 && viewMode === 'list' ? 0.45 : 1,
            },
            pressed && { opacity: 0.78 },
          ]}>
          <MaterialIcons
            name={viewMode === 'swipe' ? 'view-list' : 'swipe'}
            size={20}
            color={viewMode === 'swipe' ? theme.background.primary : theme.text.primary}
          />
        </Pressable>
      </View>

      {loading ? (
        <Skeleton.PosterGrid count={9} columns={3} aspectRatio={1.4} gap={12} style={{ padding: 16 }} />
      ) : viewMode === 'swipe' ? (
        <View style={[styles.swipeWrap, { paddingBottom: insets.bottom + 140 }]}>
          <FolderSwipeDeck
            items={items}
            resetKey={id}
            onHaventWatched={handleHaventWatched}
            onLike={handleLike}
            onOpenDetail={(item) => setEditingItem(item as FolderItem)}
          />
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 140 },
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialIcons name="folder-open" size={48} color={theme.text.tertiary} />
              <ThemedText variant="titleMedium" weight="700" align="center" style={{ marginTop: 12 }}>
                No items in this folder
              </ThemedText>
              <ThemedText variant="bodySmall" tone="secondary" align="center">
                Add anime to this folder from the rating screen.
              </ThemedText>
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
                rewatchCount: editingItem.rewatch_count ?? 0,
                notes: editingItem.notes ?? '',
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bgGlow: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    opacity: 0.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerBtnSpacer: {
    width: 36,
    height: 36,
  },
  headerText: {
    flex: 1,
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  swipeWrap: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    padding: Spacing.xs,
    gap: Spacing.sm,
  },
  itemImage: {
    width: 60,
    height: 84,
    borderRadius: Radius.sm,
  },
  itemImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContent: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 4,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  scoreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: 'auto',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 2,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.chip,
    borderWidth: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 4,
  },
});
