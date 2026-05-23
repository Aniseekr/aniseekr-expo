import { View, ScrollView, RefreshControl, Pressable, Share, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { trackingService } from '../../../libs/services/tracking/tracking-service';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { captureRef } from 'react-native-view-shot';
import { CollectionHeader } from '../../../components/collection/CollectionHeader';
import { FolderGrid } from '../../../components/collection/FolderGrid';
import { CollectionOverviewCard } from '../../../components/collection/CollectionOverviewCard';
import {
  CollectionRecentRail,
  type RecentRailItem,
} from '../../../components/collection/CollectionRecentRail';
import {
  CollectionAnimeGrid,
  type CollectionAnimeCardItem,
} from '../../../components/collection/CollectionAnimeGrid';
import { CollectionTips } from '../../../components/collection/CollectionTips';
import { CollectionSearchModal } from '../../../components/collection/CollectionSearchModal';
import { CollectionFloatingActionBar } from '../../../components/collection/CollectionFloatingActionBar';
import { ShareImageRenderer } from '../../../components/collection/ShareImageRenderer';
import { ShareListEditor } from '../../../components/collection/ShareListEditor';
import { CollectionFolder } from '../../../types';
import { collectionService } from '../../../libs/services/collection/collection-service';
import { pushAnimeDetail } from '../../../libs/utils/navigate-to-anime';
import { CreateFolderModal } from '../../../components/collection/CreateFolderModal';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import {
  loadCollectionSortModeSync,
  saveCollectionSortMode,
  type CollectionSortMode,
} from '../../../libs/services/collection-prefs';
import { Radius, Spacing, Typography } from '../../../constants/DesignSystem';
import { LocalDB } from '../../../libs/db';
import { ThemedText } from '../../../components/themed';
import { useTheme } from '../../../context/ThemeContext';
import {
  buildShareTemplate,
  type ShareEntry,
  type ShareSourceItem,
  type ShareTemplate,
  type ShareTemplateBuild,
} from '../../../libs/services/collection/share-templates';
import { UserRepository } from '../../../libs/repositories/user-repository';
import { sameArrayBy } from '../../../libs/utils/state-array';

type SortMode = CollectionSortMode;
type ScreenMode = 'collect' | 'share';

const CATEGORIES = ['All', 'Watching', 'Planned', 'Done'];

// Map UI label → DB status. Multiple labels can map to the same canonical value;
// 'All' is handled separately by skipping the WHERE clause.
const CATEGORY_TO_STATUS: Record<string, string | null> = {
  All: null,
  Watching: 'watching',
  Planned: 'planned',
  Done: 'completed',
};

// Map UI tag → system folder id (so "See all" deep-links into the folder view).
const CATEGORY_TO_SYSTEM_FOLDER: Record<string, string> = {
  All: 'system_all',
  Watching: 'system_watching',
  Planned: 'system_plan_to_watch',
  Done: 'system_completed',
};

const ANIME_PREVIEW_LIMIT = 6;

type AnimeCardRow = {
  anime_id: string;
  title: string | null;
  image_url: string | null;
  progress: number | null;
  total_episodes: number | null;
  status: string;
};

type RecentRow = {
  anime_id: string;
  title: string | null;
  image_url: string | null;
  updated_at: number | null;
};

async function fetchAnimeCards(category: string): Promise<CollectionAnimeCardItem[]> {
  const db = await LocalDB.getDatabase();
  const status = CATEGORY_TO_STATUS[category];
  const rows = await db.getAllAsync<AnimeCardRow>(
    status
      ? `SELECT anime_id, title, image_url, progress, total_episodes, status
           FROM user_anime
          WHERE title IS NOT NULL AND status = ?
          ORDER BY COALESCE(updated_at, 0) DESC`
      : `SELECT anime_id, title, image_url, progress, total_episodes, status
           FROM user_anime
          WHERE title IS NOT NULL
          ORDER BY COALESCE(updated_at, 0) DESC`,
    ...(status ? [status] : [])
  );

  return rows.map((r) => ({
    id: r.anime_id,
    title: r.title || 'Untitled',
    imageUrl: r.image_url,
    progress: r.progress ?? 0,
    totalEpisodes: r.total_episodes ?? null,
    status: r.status,
  }));
}

async function fetchRecents(): Promise<RecentRailItem[]> {
  const db = await LocalDB.getDatabase();
  const rows = await db.getAllAsync<RecentRow>(
    'SELECT anime_id, title, image_url, updated_at FROM user_anime WHERE title IS NOT NULL ORDER BY COALESCE(updated_at, 0) DESC LIMIT 10'
  );

  return rows.map((r) => ({
    id: r.anime_id,
    title: r.title || 'Untitled',
    imageUrl: r.image_url || undefined,
  }));
}

function sameCollections(current: CollectionFolder[], next: CollectionFolder[]): boolean {
  return sameArrayBy(current, next, (folder) => [
    folder.id,
    folder.name,
    folder.icon,
    folder.animeCount,
    folder.coverUrl,
    folder.folderType,
    folder.isSystemFolder,
    folder.isR18,
    folder.isShared,
    folder.sharedBy,
    folder.sortOrder,
    folder.createdAt.getTime(),
  ]);
}

function sameRecents(current: RecentRailItem[], next: RecentRailItem[]): boolean {
  return sameArrayBy(current, next, (item) => [item.id, item.title, item.imageUrl]);
}

function sameAnimeCards(
  current: CollectionAnimeCardItem[],
  next: CollectionAnimeCardItem[]
): boolean {
  return sameArrayBy(current, next, (item) => [
    item.id,
    item.title,
    item.imageUrl,
    item.progress,
    item.totalEpisodes,
    item.status,
  ]);
}

export default function CollectionScreen() {
  const { top } = useSafeAreaInsets();
  const { theme } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  // Seed from MMKV so the collection grid renders in the user's chosen sort
  // mode on frame 1 instead of flashing through `newest` first.
  const [sortMode, setSortMode] = useState<SortMode>(loadCollectionSortModeSync);
  const [collections, setCollections] = useState<CollectionFolder[]>([]);
  const [recents, setRecents] = useState<RecentRailItem[]>([]);
  const [animeCards, setAnimeCards] = useState<CollectionAnimeCardItem[]>([]);
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [editingFolder, setEditingFolder] = useState<CollectionFolder | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [screenMode, setScreenMode] = useState<ScreenMode>('collect');
  const [shareSource, setShareSource] = useState<ShareSourceItem[]>([]);
  const [shareBuild, setShareBuild] = useState<ShareTemplateBuild | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [username, setUsername] = useState<string | undefined>(undefined);
  const rendererRef = useRef<View>(null);
  const collectionLoadRef = useRef(0);
  const animeCardsLoadRef = useRef(0);
  const categoryLoadInitializedRef = useRef(false);
  const router = useRouter();

  const loadAnimeCards = useCallback(async (category: string) => {
    const requestId = ++animeCardsLoadRef.current;
    try {
      const next = await fetchAnimeCards(category);
      if (requestId !== animeCardsLoadRef.current) return;
      setAnimeCards((prev) => (sameAnimeCards(prev, next) ? prev : next));
    } catch (error) {
      if (requestId !== animeCardsLoadRef.current) return;
      console.error('Failed to load anime cards:', error);
      setAnimeCards((prev) => (prev.length === 0 ? prev : []));
    }
  }, []);

  const loadCollectionData = useCallback(async (category: string) => {
    const collectionRequestId = ++collectionLoadRef.current;
    const animeCardsRequestId = ++animeCardsLoadRef.current;
    const [foldersResult, recentsResult, cardsResult] = await Promise.allSettled([
      collectionService.getFolders(),
      fetchRecents(),
      fetchAnimeCards(category),
    ]);

    if (collectionRequestId === collectionLoadRef.current) {
      if (foldersResult.status === 'fulfilled') {
        setCollections((prev) =>
          sameCollections(prev, foldersResult.value) ? prev : foldersResult.value
        );
      } else {
        console.error('Failed to load collection:', foldersResult.reason);
      }

      if (recentsResult.status === 'fulfilled') {
        setRecents((prev) => (sameRecents(prev, recentsResult.value) ? prev : recentsResult.value));
      } else {
        console.error('Failed to load recents:', recentsResult.reason);
        setRecents((prev) => (prev.length === 0 ? prev : []));
      }
    }

    if (animeCardsRequestId === animeCardsLoadRef.current) {
      if (cardsResult.status === 'fulfilled') {
        setAnimeCards((prev) =>
          sameAnimeCards(prev, cardsResult.value) ? prev : cardsResult.value
        );
      } else {
        console.error('Failed to load anime cards:', cardsResult.reason);
        setAnimeCards((prev) => (prev.length === 0 ? prev : []));
      }
    }
  }, []);

  useEffect(() => {
    loadCollectionData(selectedCategory);
    // Initial hydration only; category changes refresh the preview cards below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadCollectionData]);

  useEffect(() => {
    if (!categoryLoadInitializedRef.current) {
      categoryLoadInitializedRef.current = true;
      return;
    }
    loadAnimeCards(selectedCategory);
  }, [loadAnimeCards, selectedCategory]);

  // Refresh counts + recents + cards whenever the tab regains focus, so adds
  // from other tabs (e.g. Bangumi wishlist) propagate without a manual pull.
  // The skipFirst ref avoids double-loading on initial mount (the effects
  // above already kicked off the first load).
  const focusInitRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusInitRef.current) {
        focusInitRef.current = true;
        return;
      }
      loadCollectionData(selectedCategory);
    }, [loadCollectionData, selectedCategory])
  );

  // Subscribe to tracking-set changes — adds/removes that happen from any
  // screen invalidate the cache and fire here, so counts update in real time
  // (no need to switch tabs or pull-to-refresh).
  useEffect(() => {
    return trackingService.onTrackedIdsChange(() => {
      loadCollectionData(selectedCategory);
    });
  }, [loadCollectionData, selectedCategory]);

  // Skip the very first write — `sortMode` was just seeded from MMKV, so
  // there's nothing to persist. Every subsequent change is a user action.
  const sortModeFirstRunRef = useRef(true);
  useEffect(() => {
    if (sortModeFirstRunRef.current) {
      sortModeFirstRunRef.current = false;
      return;
    }
    saveCollectionSortMode(sortMode);
  }, [sortMode]);

  useEffect(() => {
    let cancelled = false;
    UserRepository.getProfile()
      .then((profile) => {
        if (!cancelled && profile?.username) {
          setUsername(profile.username);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const loadShareSource = useCallback(async () => {
    try {
      const db = await LocalDB.getDatabase();
      const rows = await db.getAllAsync<{
        anime_id: string;
        title: string | null;
        image_url: string | null;
        score: number | null;
        started_at: number | null;
        completed_at: number | null;
        status: string | null;
      }>(
        'SELECT anime_id, title, image_url, score, started_at, completed_at, status FROM user_anime'
      );
      const items: ShareSourceItem[] = rows
        .filter((r) => !!r.title)
        .map((r) => {
          const ts = r.completed_at ?? r.started_at ?? null;
          return {
            id: r.anime_id,
            title: r.title || 'Untitled',
            coverUrl: r.image_url || undefined,
            score: typeof r.score === 'number' ? r.score : undefined,
            year: ts ? new Date(ts).getFullYear() : undefined,
            status: r.status ?? undefined,
          };
        });
      setShareSource(items);
    } catch (error) {
      console.error('Failed to load share source:', error);
      setShareSource([]);
    }
  }, []);

  useEffect(() => {
    if (screenMode === 'share') {
      loadShareSource();
    }
  }, [screenMode, loadShareSource]);

  const handleSelectTemplate = useCallback(
    (template: ShareTemplate) => {
      const build = buildShareTemplate(template.id, shareSource, { username });
      setShareBuild(build);
      setShareError(null);
      if (template.needsManualPick) {
        setEditorOpen(true);
      }
    },
    [shareSource, username]
  );

  const handleSaveEntries = useCallback(
    (entries: ShareEntry[]) => {
      if (!shareBuild) return;
      setShareBuild({ ...shareBuild, entries });
      setEditorOpen(false);
    },
    [shareBuild]
  );

  const handleCancelShare = useCallback(() => {
    setScreenMode('collect');
    setShareBuild(null);
    setEditorOpen(false);
    setShareError(null);
  }, []);

  const handleConfirmShare = useCallback(async () => {
    if (!shareBuild) {
      setShareError('Pick a template first');
      return;
    }
    if (shareBuild.entries.length === 0) {
      setShareError('Add at least one anime');
      return;
    }
    if (!rendererRef.current) {
      setShareError('Renderer not ready');
      return;
    }
    setCapturing(true);
    setShareError(null);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const uri = await captureRef(rendererRef, {
        format: 'png',
        quality: 0.95,
        result: 'tmpfile',
      });
      hapticsBridge.success();
      await Share.share(
        {
          url: uri,
          message: `My ${shareBuild.template.title} on Aniseekr`,
          title: `Aniseekr · ${shareBuild.template.title}`,
        },
        { dialogTitle: `Share ${shareBuild.template.title}` }
      );
    } catch (error) {
      console.error('Share capture failed:', error);
      setShareError('Could not render poster');
    } finally {
      setCapturing(false);
    }
  }, [shareBuild]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    collections.forEach((folder) => {
      if (folder.id === 'system_all') counts['All'] = folder.animeCount;
      if (folder.folderType === 'favorites') counts['Favorites'] = folder.animeCount;
      if (folder.folderType === 'watching' && folder.id === 'system_watching')
        counts['Watching'] = folder.animeCount;
      if (folder.folderType === 'completed') counts['Done'] = folder.animeCount;
      if (folder.folderType === 'dropped') counts['Dropped'] = folder.animeCount;
      if (folder.folderType === 'wishlist') counts['Planned'] = folder.animeCount;
    });
    return counts;
  }, [collections]);

  const overviewStats = useMemo(
    () => [
      {
        label: 'Watching',
        value: categoryCounts.Watching ?? 0,
        color: theme.accent,
      },
      { label: 'Done', value: categoryCounts.Done ?? 0 },
      { label: 'Planned', value: categoryCounts.Planned ?? 0 },
      { label: 'Dropped', value: categoryCounts.Dropped ?? 0 },
    ],
    [categoryCounts, theme.accent]
  );

  const totalCount = categoryCounts.All ?? 0;

  const userFolderCount = useMemo(
    () => collections.filter((f) => !f.isSystemFolder || f.folderType === 'favorites').length,
    [collections]
  );

  const handleEditFolder = useCallback((folder: CollectionFolder) => {
    setEditingFolder(folder);
    setCreateModalVisible(true);
  }, []);

  const handleSort = useCallback((mode: SortMode) => {
    setSortMode(mode);
  }, []);

  const visibleFolders = useMemo(() => {
    const targetTypeMap: Record<string, CollectionFolder['folderType']> = {
      Watching: 'watching',
      Done: 'completed',
      Dropped: 'dropped',
      Planned: 'wishlist',
    };
    // Hide the synthetic 'system_all' folder — its count duplicates the
    // overview card, so showing it as a tile is just noise.
    const baseFolders = collections.filter((f) => f.id !== 'system_all');
    let filtered: CollectionFolder[];
    if (selectedCategory === 'All') {
      // Show every folder (system + custom). System tiles let users jump
      // straight to Watching/Completed/etc on a fresh install.
      filtered = baseFolders;
    } else {
      // For a status tag: show the matching system folder plus every custom
      // folder. Custom folders aren't bound to a single status, so hiding
      // them when a tag is active would strand the user's own folders.
      const targetType = targetTypeMap[selectedCategory];
      filtered = targetType
        ? baseFolders.filter(
            (f) =>
              f.folderType === targetType ||
              f.folderType === 'custom' ||
              f.folderType === 'favorites'
          )
        : baseFolders;
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

  const folderCovers = useMemo(() => {
    const map: { [id: string]: string | undefined } = {};
    visibleFolders.forEach((f) => {
      map[f.id] = f.coverUrl;
    });
    return map;
  }, [visibleFolders]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadCollectionData(selectedCategory).finally(() => {
      setRefreshing(false);
    });
  }, [loadCollectionData, selectedCategory]);

  const refreshCollectionData = useCallback(() => {
    void loadCollectionData(selectedCategory);
  }, [loadCollectionData, selectedCategory]);

  const enterShareMode = useCallback(() => {
    hapticsBridge.tap();
    setScreenMode('share');
  }, []);

  const sortOptions: { label: string; value: SortMode }[] = useMemo(
    () => [
      { label: 'Newest', value: 'newest' },
      { label: 'Oldest', value: 'oldest' },
      { label: 'Count', value: 'count' },
      { label: 'Rarity', value: 'rarity' },
    ],
    []
  );

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background.primary, paddingTop: top }]}>
      <LinearGradient
        colors={[theme.background.primary, theme.background.secondary, theme.background.primary]}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[styles.glowAccent, { backgroundColor: `${theme.accent}26` }]}
        pointerEvents="none"
      />
      <View style={styles.container}>
        {screenMode === 'collect' ? (
          <CollectionHeader
            categories={CATEGORIES}
            selectedCategory={selectedCategory}
            categoryCounts={categoryCounts}
            totalAnime={totalCount}
            folderCount={userFolderCount}
            onSelectCategory={setSelectedCategory}
            onAddFolder={() => setCreateModalVisible(true)}
            onPressShare={enterShareMode}
            onPressSearch={() => setSearchOpen(true)}
          />
        ) : null}

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              tintColor={theme.text.primary}
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          }>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText variant="titleMedium" weight="700">
                My Folders
              </ThemedText>
              <Pressable
                onPress={() => {
                  hapticsBridge.tap();
                  setCreateModalVisible(true);
                }}
                hitSlop={8}
                style={styles.sectionHeaderRight}>
                <ThemedText variant="captionSmall" tone="secondary">
                  {visibleFolders.length} {visibleFolders.length === 1 ? 'folder' : 'folders'}
                </ThemedText>
                <MaterialIcons name="chevron-right" size={14} color={theme.text.tertiary} />
              </Pressable>
            </View>

            {selectedCategory !== 'All' ? (
              <View style={styles.sortRow}>
                {sortOptions.map((option) => {
                  const isActive = sortMode === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => handleSort(option.value)}
                      style={[
                        styles.sortChip,
                        {
                          backgroundColor: isActive ? theme.accent : theme.background.tertiary,
                          borderColor: isActive ? theme.accent : theme.glassBorder,
                        },
                      ]}>
                      <ThemedText
                        variant="captionSmall"
                        weight={isActive ? '700' : '600'}
                        style={{
                          color: isActive ? theme.background.primary : theme.text.secondary,
                        }}>
                        {option.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {visibleFolders.length > 0 ? (
              <FolderGrid
                folders={visibleFolders}
                covers={folderCovers}
                onPressFolder={(folder) =>
                  router.push(`/collection/${folder.id}?name=${folder.name}`)
                }
                onLongPressFolder={(folder) => {
                  if (!folder.isSystemFolder) handleEditFolder(folder);
                }}
              />
            ) : (
              <View style={styles.emptyState}>
                <ThemedText variant="titleMedium" weight="700" align="center">
                  {selectedCategory === 'All'
                    ? 'No folders yet'
                    : `No ${selectedCategory.toLowerCase()} folders`}
                </ThemedText>
                <ThemedText variant="bodySmall" tone="secondary" align="center">
                  {selectedCategory === 'All'
                    ? 'Create a folder to organize the anime you love.'
                    : 'Anime with this status will appear here.'}
                </ThemedText>
                {selectedCategory === 'All' ? (
                  <Pressable
                    onPress={() => {
                      hapticsBridge.tap();
                      setCreateModalVisible(true);
                    }}
                    style={({ pressed }) => [
                      styles.emptyAction,
                      {
                        backgroundColor: theme.accent,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}>
                    <MaterialIcons
                      name="create-new-folder"
                      size={16}
                      color={theme.background.primary}
                    />
                    <ThemedText
                      variant="bodySmall"
                      weight="700"
                      style={{ color: theme.background.primary }}>
                      New folder
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>

          <View style={styles.overviewWrap}>
            <CollectionOverviewCard total={totalCount} stats={overviewStats} />
          </View>

          <View style={styles.statsButtonRow}>
            <Pressable
              onPress={() => {
                hapticsBridge.tap();
                router.push('/collection/stats');
              }}
              style={({ pressed }) => [
                styles.statsButton,
                {
                  backgroundColor: theme.background.secondary,
                  borderColor: theme.glassBorder,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}>
              <MaterialIcons name="bar-chart" size={16} color={theme.accent} />
              <ThemedText variant="titleSmall" weight="600" style={styles.statsButtonLabel}>
                Library stats
              </ThemedText>
              <MaterialIcons name="chevron-right" size={18} color={theme.text.tertiary} />
            </Pressable>
          </View>

          <View style={styles.section}>
            <CollectionTips
              context={{
                folderCount: collections.filter((f) => !f.isSystemFolder).length,
                hasUnrated: false,
              }}
            />
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText variant="titleMedium" weight="700">
                {selectedCategory === 'All' ? 'Recent anime' : `${selectedCategory} anime`}
              </ThemedText>
              {animeCards.length > ANIME_PREVIEW_LIMIT ? (
                <Pressable
                  onPress={() => {
                    hapticsBridge.tap();
                    const folderId = CATEGORY_TO_SYSTEM_FOLDER[selectedCategory] ?? 'system_all';
                    router.push(
                      `/collection/${folderId}?name=${encodeURIComponent(selectedCategory)}`
                    );
                  }}
                  hitSlop={8}
                  style={styles.sectionHeaderRight}>
                  <ThemedText variant="captionSmall" tone="secondary" weight="600">
                    See all {animeCards.length}
                  </ThemedText>
                  <MaterialIcons name="chevron-right" size={14} color={theme.text.tertiary} />
                </Pressable>
              ) : null}
            </View>
            {animeCards.length > 0 ? (
              <CollectionAnimeGrid
                items={animeCards.slice(0, ANIME_PREVIEW_LIMIT)}
                onPressItem={(item) =>
                  pushAnimeDetail(router, {
                    id: item.id,
                    title: item.title,
                    image: item.imageUrl ?? undefined,
                  })
                }
              />
            ) : (
              <View style={styles.emptyAnimeState}>
                <ThemedText variant="titleMedium" weight="700" align="center">
                  No anime here yet
                </ThemedText>
                <ThemedText variant="bodySmall" tone="secondary" align="center">
                  {selectedCategory === 'All'
                    ? 'Rate or import anime to start building your library.'
                    : `Nothing marked as ${selectedCategory.toLowerCase()} yet.`}
                </ThemedText>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <CollectionRecentRail
              items={recents}
              onPressItem={(item) =>
                pushAnimeDetail(router, {
                  id: item.id,
                  title: item.title,
                  image: item.imageUrl,
                })
              }
              onPressSeeAll={() => router.push('/(rate)')}
            />
          </View>
        </ScrollView>

        <CreateFolderModal
          visible={isCreateModalVisible}
          onClose={() => {
            setCreateModalVisible(false);
            setEditingFolder(null);
          }}
          onCreated={refreshCollectionData}
          onUpdate={async (id, data) => {
            await collectionService.updateFolder(id, data);
          }}
          editing={
            editingFolder
              ? {
                  id: editingFolder.id,
                  name: editingFolder.name,
                  icon: editingFolder.icon,
                  isR18: editingFolder.isR18,
                  isShared: editingFolder.isShared,
                }
              : undefined
          }
        />

        <CollectionSearchModal
          visible={searchOpen}
          onClose={() => setSearchOpen(false)}
          folders={collections}
        />

        {screenMode === 'share' ? (
          <>
            <CollectionFloatingActionBar
              mode="share"
              selectedCount={shareBuild?.entries.length ?? 0}
              selectedTemplateId={shareBuild?.template.id ?? null}
              capturing={capturing}
              onSelectTemplate={handleSelectTemplate}
              onConfirmShare={handleConfirmShare}
              onCancelShare={handleCancelShare}
            />
            {shareError ? (
              <View pointerEvents="none" style={styles.errorBanner}>
                <ThemedText variant="bodySmall" weight="600" style={styles.errorBannerText}>
                  {shareError}
                </ThemedText>
              </View>
            ) : null}
            <ShareListEditor
              visible={editorOpen}
              build={shareBuild}
              source={shareSource}
              onClose={() => setEditorOpen(false)}
              onSave={handleSaveEntries}
            />
            {shareBuild ? (
              <View pointerEvents="none" style={styles.offscreenRenderer}>
                <ShareImageRenderer ref={rendererRef} build={shareBuild} />
              </View>
            ) : null}
          </>
        ) : null}
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
  glowAccent: {
    position: 'absolute',
    top: -100,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    opacity: 0.5,
  },
  scrollContent: {
    paddingBottom: 140,
    gap: 14,
  },
  overviewWrap: {
    paddingHorizontal: Spacing.lg,
  },
  statsButtonRow: {
    paddingHorizontal: Spacing.lg,
  },
  statsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.chipLg,
    borderWidth: 1,
  },
  statsButtonLabel: {
    flex: 1,
    ...Typography.titleSmall,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  sortChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
  },
  emptyAnimeState: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: Spacing.xs,
  },
  emptyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.chipLg,
  },
  offscreenRenderer: {
    position: 'absolute',
    left: -10000,
    top: -10000,
    width: 1080,
    height: 1920,
  },
  errorBanner: {
    position: 'absolute',
    bottom: 200,
    left: Spacing.md,
    right: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: 'rgba(255,69,58,0.95)',
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  errorBannerText: {
    color: '#fff',
  },
});
