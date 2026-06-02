import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { ThemedText, readableTextOn } from '../themed';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { LocalDB } from '../../libs/db';
import { collectionService } from '../../libs/services/collection/collection-service';
import { trackingService } from '../../libs/services/tracking/tracking-service';
import { patchUserPrefs } from '../../libs/services/user-prefs';
import type { CollectionFolder } from '../../types';
import type { AnimeStatus } from '../../libs/services/auth/types';

type IoniconName = keyof typeof Ionicons.glyphMap;

// ---------------------------------------------------------------------------
// Module-level sub-components (hoisted to avoid remounting on every parent render)
// ---------------------------------------------------------------------------

interface SectionLabelProps {
  children: string;
}

function SectionLabel({ children }: SectionLabelProps) {
  return (
    <ThemedText variant="captionSmall" tone="tertiary" style={styles.sectionLabel}>
      {children.toUpperCase()}
    </ThemedText>
  );
}

interface FolderRowProps {
  folder: CollectionFolder;
  selected: boolean;
  busy: boolean;
  onPress: () => void;
}

function FolderRow({ folder, selected, busy, onPress }: FolderRowProps) {
  const { theme } = useTheme();
  const fallbackIcon: IoniconName = 'folder';
  const icon = FOLDER_ICONS[folder.id] ?? ((folder.icon as IoniconName) || fallbackIcon);
  const checkColor = readableTextOn(theme.accent);
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? theme.background.tertiary : 'transparent',
          opacity: busy ? 0.6 : 1,
        },
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={folder.name}>
      <View
        style={[
          styles.rowIcon,
          {
            backgroundColor: selected ? theme.accent : theme.background.tertiary,
            borderColor: selected ? theme.accent : theme.glassBorder,
          },
        ]}>
        <Ionicons name={icon} size={18} color={selected ? checkColor : theme.text.secondary} />
      </View>
      <View style={styles.rowText}>
        <ThemedText variant="titleSmall" weight={selected ? '700' : '500'}>
          {folder.name}
        </ThemedText>
        {folder.animeCount > 0 ? (
          <ThemedText variant="caption" tone="tertiary">
            {folder.animeCount} items
          </ThemedText>
        ) : null}
      </View>
      {busy ? (
        <ActivityIndicator color={theme.text.secondary} />
      ) : selected ? (
        <Ionicons name="checkmark" size={20} color={theme.accent} />
      ) : (
        <Ionicons name="add" size={20} color={theme.text.tertiary} />
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

export interface AddToCollectionAnime {
  id: string;
  title: string;
  image: string;
}

interface AddToCollectionSheetProps {
  visible: boolean;
  anime: AddToCollectionAnime | null;
  onClose: () => void;
  onChanged?: () => void;
}

// System status folders map to a single `user_anime.status` column, so they
// behave like a radio group. Favorites + custom folders are independent toggles.
const STATUS_FOLDER_TO_DB: Record<string, AnimeStatus> = {
  system_watching: 'watching',
  system_completed: 'completed',
  system_dropped: 'dropped',
  system_plan_to_watch: 'planned',
};

const FOLDER_ICONS: Record<string, IoniconName> = {
  system_favorites: 'heart',
  system_watching: 'play-circle',
  system_completed: 'checkmark-circle',
  system_dropped: 'close-circle',
  system_plan_to_watch: 'calendar',
};

function AddToCollectionSheetComponent({
  visible,
  anime,
  onClose,
  onChanged,
}: AddToCollectionSheetProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [folders, setFolders] = useState<CollectionFolder[]>([]);
  const [isFav, setIsFav] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<AnimeStatus | null>(null);
  const [customMembership, setCustomMembership] = useState<Set<string>>(new Set());
  const [busyFolder, setBusyFolder] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !anime) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [allFolders, fav, status, db] = await Promise.all([
          collectionService.getFolders(),
          LocalDB.isFavorite(anime.id),
          trackingService.getStatus(anime.id),
          LocalDB.getDatabase(),
        ]);
        const customFolders = allFolders.filter((f) => !f.isSystemFolder);
        const customIds = customFolders.map((f) => f.id);
        const membership = new Set<string>();
        if (customIds.length > 0) {
          const placeholders = customIds.map(() => '?').join(',');
          const rows = await db.getAllAsync<{ folder_id: string }>(
            `SELECT folder_id FROM collection_folder_items
              WHERE anime_id = ? AND folder_id IN (${placeholders})`,
            anime.id,
            ...customIds
          );
          for (const r of rows) membership.add(r.folder_id);
        }
        if (cancelled) return;
        setFolders(allFolders);
        setIsFav(fav);
        setCurrentStatus(status?.status ?? null);
        setCustomMembership(membership);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, anime]);

  const remember = useCallback((folderId: string) => {
    void patchUserPrefs({ lastAddedFolderId: folderId });
  }, []);

  const toggleStatusFolder = useCallback(
    async (folderId: string) => {
      if (!anime) return;
      const target = STATUS_FOLDER_TO_DB[folderId];
      if (!target) return;
      setBusyFolder(folderId);
      try {
        const isSelected = currentStatus === target;
        const next: AnimeStatus | null = isSelected ? null : target;
        if (next) {
          await trackingService.updateStatus(anime.id, next, {
            title: anime.title,
            imageUrl: anime.image,
          });
          setCurrentStatus(next);
          remember(folderId);
        } else {
          // Clearing status; keep the row but null it out so it disappears from
          // status-folder queries.
          const db = await LocalDB.getDatabase();
          await db.runAsync('DELETE FROM user_anime WHERE anime_id = ?', anime.id);
          trackingService.invalidateTrackingCache();
          setCurrentStatus(null);
        }
        hapticsBridge.selection();
        onChanged?.();
      } finally {
        setBusyFolder(null);
      }
    },
    [anime, currentStatus, onChanged, remember]
  );

  const toggleFavorites = useCallback(async () => {
    if (!anime) return;
    setBusyFolder('system_favorites');
    try {
      if (isFav) {
        await LocalDB.removeFavorite(anime.id);
        setIsFav(false);
      } else {
        await LocalDB.addFavorite({ id: anime.id, title: anime.title, image: anime.image });
        setIsFav(true);
        remember('system_favorites');
      }
      hapticsBridge.selection();
      onChanged?.();
    } finally {
      setBusyFolder(null);
    }
  }, [anime, isFav, onChanged, remember]);

  const toggleCustom = useCallback(
    async (folderId: string) => {
      if (!anime) return;
      setBusyFolder(folderId);
      try {
        const already = customMembership.has(folderId);
        if (already) {
          await collectionService.removeFromFolder(anime.id, folderId);
        } else {
          // Custom folder cards in the collection screen read titles/covers from
          // user_anime via a JOIN, so make sure that row exists before tagging
          // the folder. We don't overwrite an existing status.
          if (!currentStatus) {
            await trackingService.upsertTracking({
              animeId: anime.id,
              status: 'planned',
              title: anime.title,
              imageUrl: anime.image,
            });
            setCurrentStatus('planned');
          }
          await collectionService.addToFolder(anime.id, folderId);
          remember(folderId);
        }
        const next = new Set(customMembership);
        if (already) next.delete(folderId);
        else next.add(folderId);
        setCustomMembership(next);
        hapticsBridge.selection();
        onChanged?.();
      } finally {
        setBusyFolder(null);
      }
    },
    [anime, customMembership, currentStatus, onChanged, remember]
  );

  const { statusFolders, favoritesFolder, customFolders } = useMemo(() => {
    const status = folders.filter(
      (f) => f.isSystemFolder && f.id !== 'system_all' && f.id !== 'system_favorites'
    );
    const favorites = folders.find((f) => f.id === 'system_favorites') ?? null;
    const custom = folders.filter((f) => !f.isSystemFolder);
    return { statusFolders: status, favoritesFolder: favorites, customFolders: custom };
  }, [folders]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
              paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.sm,
            },
          ]}>
          <View style={[styles.grabber, { backgroundColor: theme.text.tertiary, opacity: 0.4 }]} />
          <View style={styles.header}>
            <ThemedText variant="titleMedium" weight="700">
              Add to collection
            </ThemedText>
            <ThemedText variant="bodySmall" tone="secondary" numberOfLines={1}>
              {anime?.title ?? ''}
            </ThemedText>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={theme.text.secondary} />
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
              <SectionLabel>Status</SectionLabel>
              {statusFolders.map((f) => {
                const selected = STATUS_FOLDER_TO_DB[f.id] === currentStatus;
                return (
                  <FolderRow
                    key={f.id}
                    folder={f}
                    selected={selected}
                    busy={busyFolder === f.id}
                    onPress={() => toggleStatusFolder(f.id)}
                  />
                );
              })}

              {favoritesFolder ? (
                <>
                  <SectionLabel>Favorites</SectionLabel>
                  <FolderRow
                    folder={favoritesFolder}
                    selected={isFav}
                    busy={busyFolder === 'system_favorites'}
                    onPress={toggleFavorites}
                  />
                </>
              ) : null}

              {customFolders.length > 0 ? (
                <>
                  <SectionLabel>Custom</SectionLabel>
                  {customFolders.map((f) => (
                    <FolderRow
                      key={f.id}
                      folder={f}
                      selected={customMembership.has(f.id)}
                      busy={busyFolder === f.id}
                      onPress={() => toggleCustom(f.id)}
                    />
                  ))}
                </>
              ) : null}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    maxHeight: '85%',
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.sm,
  },
  header: {
    paddingHorizontal: Spacing.xs,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
    gap: 2,
  },
  loading: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  body: {
    paddingBottom: Spacing.sm,
  },
  sectionLabel: {
    letterSpacing: 1,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
});

export const AddToCollectionSheet = memo(AddToCollectionSheetComponent);
