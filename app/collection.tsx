import {
  View,
  ScrollView,
  RefreshControl,
  Pressable,
  Share,
  StyleSheet,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { captureRef } from 'react-native-view-shot';
import { CollectionHeader } from '../components/collection/CollectionHeader';
import { FolderGrid } from '../components/collection/FolderGrid';
import { CollectionOverviewCard } from '../components/collection/CollectionOverviewCard';
import {
  CollectionRecentRail,
  type RecentRailItem,
} from '../components/collection/CollectionRecentRail';
import { CollectionTips } from '../components/collection/CollectionTips';
import { CollectionSearchModal } from '../components/collection/CollectionSearchModal';
import { CollectionFloatingActionBar } from '../components/collection/CollectionFloatingActionBar';
import { ShareImageRenderer } from '../components/collection/ShareImageRenderer';
import { ShareListEditor } from '../components/collection/ShareListEditor';
import { CollectionFolder } from '../types';
import { collectionService } from '../libs/services/collection/collection-service';
import { CreateFolderModal } from '../components/collection/CreateFolderModal';
import { hapticsBridge } from '../modules/haptics/hapticsBridge';
import {
  loadCollectionSortMode,
  saveCollectionSortMode,
  type CollectionSortMode,
} from '../libs/services/collection-prefs';
import { Radius, Spacing, Typography } from '../constants/DesignSystem';
import { LocalDB } from '../libs/db';
import { ThemedText } from '../components/themed';
import { useTheme } from '../context/ThemeContext';
import {
  buildShareTemplate,
  type ShareEntry,
  type ShareSourceItem,
  type ShareTemplate,
  type ShareTemplateBuild,
} from '../libs/services/collection/share-templates';
import { UserRepository } from '../libs/repositories/user-repository';

type SortMode = CollectionSortMode;
type ScreenMode = 'collect' | 'share';

const CATEGORIES = ['All', 'Watching', 'Completed', 'Plan', 'Dropped'];

export default function CollectionScreen() {
  const { top } = useSafeAreaInsets();
  const { theme } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [collections, setCollections] = useState<CollectionFolder[]>([]);
  const [recents, setRecents] = useState<RecentRailItem[]>([]);
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
  const hydratedRef = useRef(false);
  const router = useRouter();

  const loadCollection = async () => {
    try {
      const data = await collectionService.getFolders();
      setCollections(data);
    } catch (error) {
      console.error('Failed to load collection:', error);
    }
  };

  const loadRecents = useCallback(async () => {
    try {
      const db = await LocalDB.getDatabase();
      const rows = await db.getAllAsync<{
        anime_id: string;
        title: string | null;
        image_url: string | null;
        updated_at: number | null;
      }>(
        'SELECT anime_id, title, image_url, updated_at FROM user_anime WHERE title IS NOT NULL ORDER BY COALESCE(updated_at, 0) DESC LIMIT 10'
      );
      setRecents(
        rows.map((r) => ({
          id: r.anime_id,
          title: r.title || 'Untitled',
          imageUrl: r.image_url || undefined,
        }))
      );
    } catch (error) {
      console.error('Failed to load recents:', error);
      setRecents([]);
    }
  }, []);

  useEffect(() => {
    loadCollection();
    loadRecents();
  }, [loadRecents]);

  useEffect(() => {
    let cancelled = false;
    loadCollectionSortMode().then((mode) => {
      if (cancelled) return;
      setSortMode(mode);
      hydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
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
      if (folder.folderType === 'completed') counts['Completed'] = folder.animeCount;
      if (folder.folderType === 'dropped') counts['Dropped'] = folder.animeCount;
      if (folder.folderType === 'wishlist') counts['Plan'] = folder.animeCount;
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
      { label: 'Completed', value: categoryCounts.Completed ?? 0 },
      { label: 'Plan', value: categoryCounts.Plan ?? 0 },
      { label: 'Dropped', value: categoryCounts.Dropped ?? 0 },
    ],
    [categoryCounts, theme.accent]
  );

  const totalCount = categoryCounts.All ?? 0;

  const userFolderCount = useMemo(
    () =>
      collections.filter(
        (f) => !f.isSystemFolder || f.folderType === 'favorites'
      ).length,
    [collections]
  );

  const handleEditFolder = useCallback(
    (folder: CollectionFolder) => {
      setEditingFolder(folder);
      setCreateModalVisible(true);
    },
    []
  );

  const handleSort = useCallback((mode: SortMode) => {
    setSortMode(mode);
  }, []);

  const visibleFolders = useMemo(() => {
    const targetTypeMap: Record<string, CollectionFolder['folderType']> = {
      Watching: 'watching',
      Completed: 'completed',
      Dropped: 'dropped',
      Plan: 'wishlist',
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
      const targetType = targetTypeMap[selectedCategory];
      filtered = targetType
        ? baseFolders.filter((f) => f.folderType === targetType)
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
    Promise.all([loadCollection(), loadRecents()]).finally(() => {
      setRefreshing(false);
    });
  }, [loadRecents]);

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
        colors={[
          theme.background.primary,
          theme.background.secondary,
          theme.background.primary,
        ]}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.glowAccent,
          { backgroundColor: `${theme.accent}26` },
        ]}
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
                  {visibleFolders.length}{' '}
                  {visibleFolders.length === 1 ? 'folder' : 'folders'}
                </ThemedText>
                <MaterialIcons
                  name="chevron-right"
                  size={14}
                  color={theme.text.tertiary}
                />
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
                          backgroundColor: isActive
                            ? theme.accent
                            : theme.background.tertiary,
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

          <View style={styles.section}>
            <CollectionRecentRail
              items={recents}
              onPressItem={(item) => router.push(`/(rate)/anime/${item.id}`)}
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
          onCreated={loadCollection}
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
