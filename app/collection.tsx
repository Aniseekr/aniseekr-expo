import {
  View,
  FlatList,
  RefreshControl,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  TouchableOpacity,
  Text,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { captureRef } from 'react-native-view-shot';
import { CollectionHeader } from '../components/collection/CollectionHeader';
import { FolderList } from '../components/collection/FolderList';
import { CollectionOverviewCard } from '../components/collection/CollectionOverviewCard';
import { CollectionTips } from '../components/collection/CollectionTips';
import { CollectionSearchModal } from '../components/collection/CollectionSearchModal';
import { CollectionModeToggle } from '../components/collection/CollectionModeToggle';
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
import { Colors, FontFamily, Radius, Spacing, Typography } from '../constants/DesignSystem';
import { LocalDB } from '../libs/db';
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

export default function CollectionScreen() {
  const { top } = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [collections, setCollections] = useState<CollectionFolder[]>([]);
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
        if (!cancelled && profile?.username && profile.username !== 'Not signed in') {
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
    () => [
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

  const handleEditFolder = useCallback(
    (folder: { id: string; name: string; icon: string; isR18: boolean; isShared: boolean }) => {
      const match = collections.find((f) => f.id === folder.id);
      if (match) {
        setEditingFolder(match);
        setCreateModalVisible(true);
      }
    },
    [collections]
  );

  const renderFolder = useCallback(
    ({ item }: { item: CollectionFolder }) => (
      <FolderList
        folders={[item]}
        folderPreviews={{}}
        onFolderPress={(folder) => router.push(`/collection/${folder.id}?name=${folder.name}`)}
        onEditFolder={handleEditFolder}
      />
    ),
    [router, handleEditFolder]
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
        {screenMode === 'collect' ? (
          <CollectionHeader
            categories={categories}
            selectedCategory={selectedCategory}
            categoryCounts={categoryCounts}
            categoryIcons={categoryIcons}
            onSelectCategory={setSelectedCategory}
            onAddFolder={() => setCreateModalVisible(true)}
            onPressSearch={() => setSearchOpen(true)}
          />
        ) : null}

        <View style={styles.modeToggleRow}>
          <CollectionModeToggle mode={screenMode} onChange={setScreenMode} />
        </View>

        <CollectionOverviewCard
          stats={overviewStats}
          recents={recentItems}
          onViewAll={() => setSelectedCategory('All')}
        />

        <View style={styles.statsButtonRow}>
          <Pressable
            onPress={() => {
              hapticsBridge.tap();
              router.push('/collection/stats');
            }}
            style={({ pressed }) => [styles.statsButton, { opacity: pressed ? 0.85 : 1 }]}>
            <MaterialIcons name="bar-chart" size={16} color={Colors.primary} />
            <Text style={styles.statsButtonLabel}>Library stats</Text>
            <MaterialIcons name="chevron-right" size={18} color={Colors.text.tertiary} />
          </Pressable>
        </View>

        <CollectionTips
          context={{
            folderCount: collections.filter((f) => !f.isSystemFolder).length,
            hasUnrated: false,
          }}
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
                <Text style={styles.errorBannerText}>{shareError}</Text>
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
  statsButtonRow: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  statsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.glass.medium,
    borderRadius: Radius.chipLg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  statsButtonLabel: {
    flex: 1,
    color: Colors.text.primary,
    ...Typography.titleSmall,
    fontWeight: '600',
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
  modeToggleRow: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
    alignItems: 'center',
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
    ...Typography.bodySmall,
    fontWeight: '600',
  },
});
