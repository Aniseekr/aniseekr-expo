import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { CollectionFolder } from '../../types';
import { LocalDB } from '../../libs/db';

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
let AsyncStorage: AsyncStorageLike;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  const memory = new Map<string, string>();
  AsyncStorage = {
    async getItem(k) {
      return memory.get(k) ?? null;
    },
    async setItem(k, v) {
      memory.set(k, v);
    },
  };
}

const RECENT_KEY = 'aniseekr.collection.search.recents.v1';
const MAX_RECENT = 8;
const DEBOUNCE_MS = 320;

interface AnimeIndexEntry {
  id: string;
  title: string;
  folderId: string;
  folderName: string;
}

interface FolderHit {
  type: 'folder';
  folder: CollectionFolder;
}

interface AnimeHit {
  type: 'anime';
  anime: AnimeIndexEntry;
}

type SearchHit = FolderHit | AnimeHit;

interface CollectionSearchModalProps {
  visible: boolean;
  onClose: () => void;
  folders: CollectionFolder[];
}

export function CollectionSearchModal({ visible, onClose, folders }: CollectionSearchModalProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [animeIndex, setAnimeIndex] = useState<AnimeIndexEntry[]>([]);
  const [indexReady, setIndexReady] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem(RECENT_KEY)
      .then((v) => {
        if (!v) return;
        try {
          const parsed = JSON.parse(v);
          if (Array.isArray(parsed)) {
            setRecent(parsed.filter((s) => typeof s === 'string').slice(0, MAX_RECENT));
          }
        } catch {
          // ignore
        }
      })
      .catch(() => {});
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setDebouncedQuery('');
      return;
    }
    let cancelled = false;
    setIndexReady(false);
    (async () => {
      try {
        const db = await LocalDB.getDatabase();
        const customRows = await db.getAllAsync<{
          folder_id: string;
          anime_id: string;
          title: string | null;
        }>(
          `SELECT cfi.folder_id as folder_id, cfi.anime_id as anime_id, ua.title as title
           FROM collection_folder_items cfi
           LEFT JOIN user_anime ua ON ua.anime_id = cfi.anime_id`
        );
        const userAnimeRows = await db.getAllAsync<{
          anime_id: string;
          title: string | null;
          status: string | null;
        }>('SELECT anime_id, title, status FROM user_anime');
        const favoriteRows = await db.getAllAsync<{
          id: string;
          title: string | null;
        }>('SELECT id, title FROM favorites');

        if (cancelled) return;

        const folderById = new Map(folders.map((f) => [f.id, f]));
        const statusFolderMap: Record<string, string> = {
          watching: 'system_watching',
          completed: 'system_completed',
          dropped: 'system_dropped',
          plan_to_watch: 'system_plan_to_watch',
        };

        const entries: AnimeIndexEntry[] = [];
        const seen = new Set<string>();
        const push = (entry: AnimeIndexEntry) => {
          const key = `${entry.folderId}::${entry.id}`;
          if (seen.has(key)) return;
          seen.add(key);
          entries.push(entry);
        };

        for (const row of customRows) {
          if (!row.title) continue;
          const folder = folderById.get(row.folder_id);
          if (!folder) continue;
          push({
            id: row.anime_id,
            title: row.title,
            folderId: folder.id,
            folderName: folder.name,
          });
        }
        for (const row of userAnimeRows) {
          if (!row.title) continue;
          const allFolder = folderById.get('system_all');
          if (allFolder) {
            push({
              id: row.anime_id,
              title: row.title,
              folderId: allFolder.id,
              folderName: allFolder.name,
            });
          }
          if (row.status) {
            const target = statusFolderMap[row.status];
            const folder = target ? folderById.get(target) : undefined;
            if (folder) {
              push({
                id: row.anime_id,
                title: row.title,
                folderId: folder.id,
                folderName: folder.name,
              });
            }
          }
        }
        for (const row of favoriteRows) {
          if (!row.title) continue;
          const folder = folderById.get('system_favorites');
          if (folder) {
            push({
              id: row.id,
              title: row.title,
              folderId: folder.id,
              folderName: folder.name,
            });
          }
        }

        setAnimeIndex(entries);
        setIndexReady(true);
      } catch {
        if (!cancelled) {
          setAnimeIndex([]);
          setIndexReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, folders]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const persistRecent = useCallback(async (next: string[]) => {
    try {
      await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // best-effort
    }
  }, []);

  const folderHits = useMemo<FolderHit[]>(() => {
    if (!debouncedQuery) return [];
    const q = debouncedQuery.toLowerCase();
    return folders
      .filter((f) => f.name.toLowerCase().includes(q))
      .map((folder) => ({ type: 'folder' as const, folder }));
  }, [debouncedQuery, folders]);

  const animeHits = useMemo<AnimeHit[]>(() => {
    if (!debouncedQuery) return [];
    const q = debouncedQuery.toLowerCase();
    const seen = new Set<string>();
    const out: AnimeHit[] = [];
    for (const entry of animeIndex) {
      if (!entry.title.toLowerCase().includes(q)) continue;
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push({ type: 'anime', anime: entry });
      if (out.length >= 50) break;
    }
    return out;
  }, [debouncedQuery, animeIndex]);

  const recordRecent = useCallback(
    (term: string) => {
      const trimmed = term.trim();
      if (!trimmed) return;
      const next = [trimmed, ...recent.filter((r) => r !== trimmed)].slice(0, MAX_RECENT);
      setRecent(next);
      persistRecent(next);
    },
    [recent, persistRecent]
  );

  const handleClose = useCallback(() => {
    hapticsBridge.tap();
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const handleSelectFolder = useCallback(
    (folder: CollectionFolder) => {
      hapticsBridge.tap();
      recordRecent(folder.name);
      Keyboard.dismiss();
      onClose();
      router.push(`/collection/${folder.id}?name=${encodeURIComponent(folder.name)}`);
    },
    [onClose, recordRecent, router]
  );

  const handleSelectAnime = useCallback(
    (entry: AnimeIndexEntry) => {
      hapticsBridge.tap();
      recordRecent(entry.title);
      Keyboard.dismiss();
      onClose();
      router.push(`/(rate)/anime/${entry.id}`);
    },
    [onClose, recordRecent, router]
  );

  const handleRecentTap = useCallback((term: string) => {
    hapticsBridge.selection();
    setQuery(term);
  }, []);

  const handleClearRecent = useCallback(() => {
    hapticsBridge.warning();
    setRecent([]);
    persistRecent([]);
  }, [persistRecent]);

  const sections: { key: string; title: string; data: SearchHit[] }[] = useMemo(() => {
    const out: { key: string; title: string; data: SearchHit[] }[] = [];
    if (folderHits.length > 0) {
      out.push({ key: 'folders', title: 'Folders', data: folderHits });
    }
    if (animeHits.length > 0) {
      out.push({
        key: 'anime',
        title: 'Anime in your collection',
        data: animeHits,
      });
    }
    return out;
  }, [folderHits, animeHits]);

  type FlatRow =
    | { kind: 'header'; key: string; title: string }
    | { kind: 'folder'; key: string; folder: CollectionFolder }
    | { kind: 'anime'; key: string; anime: AnimeIndexEntry };

  const flatListData = useMemo<FlatRow[]>(() => {
    const items: FlatRow[] = [];
    for (const section of sections) {
      items.push({
        kind: 'header',
        key: `h-${section.key}`,
        title: section.title,
      });
      for (const hit of section.data) {
        if (hit.type === 'folder') {
          items.push({
            kind: 'folder',
            key: `f-${hit.folder.id}`,
            folder: hit.folder,
          });
        } else {
          items.push({
            kind: 'anime',
            key: `a-${hit.anime.folderId}-${hit.anime.id}`,
            anime: hit.anime,
          });
        }
      }
    }
    return items;
  }, [sections]);

  const hasQuery = debouncedQuery.length > 0;
  const hasResults = folderHits.length > 0 || animeHits.length > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      presentationStyle="fullScreen"
      statusBarTranslucent>
      <View style={[styles.root, { backgroundColor: theme.background.primary }]}>
        <LinearGradient colors={theme.gradient} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={styles.safe} edges={['top']}>
          <View style={[styles.header, { paddingTop: insets.top > 0 ? 0 : Spacing.sm }]}>
            <View
              style={[
                styles.searchBar,
                {
                  backgroundColor: theme.background.secondary,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <MaterialIcons name="search" size={22} color={theme.text.secondary} />
              <TextInput
                ref={inputRef}
                autoFocus
                placeholder="Search your collection"
                placeholderTextColor={theme.text.tertiary}
                value={query}
                onChangeText={setQuery}
                style={[styles.input, { color: theme.text.primary }]}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
              />
              {query.length > 0 ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={theme.text.tertiary} />
                </Pressable>
              ) : null}
            </View>
            <Pressable onPress={handleClose} hitSlop={12} style={styles.cancel}>
              <Text style={[styles.cancelText, { color: theme.accent }]}>Close</Text>
            </Pressable>
          </View>

          {!hasQuery ? (
            <ScrollView
              contentContainerStyle={{
                paddingBottom: insets.bottom + 40,
                paddingHorizontal: Spacing.md,
                paddingTop: Spacing.md,
              }}
              keyboardShouldPersistTaps="handled">
              {recent.length > 0 ? (
                <View>
                  <View style={styles.sectionRow}>
                    <Text style={[styles.sectionTitle, { color: theme.text.primary }]}>Recent</Text>
                    <Pressable onPress={handleClearRecent} hitSlop={8}>
                      <Text style={[styles.clearText, { color: theme.accent }]}>Clear</Text>
                    </Pressable>
                  </View>
                  <View style={styles.recentRow}>
                    {recent.map((term) => (
                      <Pressable
                        key={term}
                        onPress={() => handleRecentTap(term)}
                        style={({ pressed }) => [
                          styles.recentChip,
                          {
                            backgroundColor: theme.background.secondary,
                            borderColor: theme.glassBorder,
                            opacity: pressed ? 0.8 : 1,
                          },
                        ]}>
                        <MaterialIcons name="history" size={14} color={theme.text.secondary} />
                        <Text
                          style={[styles.recentText, { color: theme.text.primary }]}
                          numberOfLines={1}>
                          {term}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={styles.emptyHint}>
                  <MaterialIcons name="search" size={28} color={theme.text.tertiary} />
                  <Text style={[styles.emptyHintTitle, { color: theme.text.primary }]}>
                    Search your library
                  </Text>
                  <Text style={[styles.emptyHintBody, { color: theme.text.secondary }]}>
                    Find folders and anime you&apos;ve already collected.
                  </Text>
                </View>
              )}
            </ScrollView>
          ) : !indexReady ? (
            <View style={styles.emptyHint}>
              <Text style={[styles.emptyHintBody, { color: theme.text.secondary }]}>
                Indexing your collection…
              </Text>
            </View>
          ) : !hasResults ? (
            <View style={styles.emptyHint}>
              <MaterialIcons name="search-off" size={28} color={theme.text.tertiary} />
              <Text style={[styles.emptyHintTitle, { color: theme.text.primary }]}>No matches</Text>
              <Text style={[styles.emptyHintBody, { color: theme.text.secondary }]}>
                Nothing in your collection for &ldquo;{debouncedQuery}&rdquo;.
              </Text>
            </View>
          ) : (
            <FlatList
              data={flatListData}
              keyExtractor={(item) => item.key}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                padding: Spacing.md,
                paddingBottom: insets.bottom + 40,
                gap: 6,
              }}
              renderItem={({ item }) => {
                if (item.kind === 'header') {
                  return (
                    <Text
                      style={[
                        styles.sectionTitle,
                        styles.sectionTitleInline,
                        { color: theme.text.primary },
                      ]}>
                      {item.title}
                    </Text>
                  );
                }
                if (item.kind === 'folder') {
                  const folder = item.folder;
                  return (
                    <Pressable
                      onPress={() => handleSelectFolder(folder)}
                      style={({ pressed }) => [
                        styles.row,
                        {
                          backgroundColor: theme.background.secondary,
                          borderColor: theme.glassBorder,
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}>
                      <View style={[styles.iconBubble, { backgroundColor: theme.accent + '24' }]}>
                        <MaterialIcons
                          name={folder.isSystemFolder ? 'folder-special' : 'folder'}
                          size={18}
                          color={theme.accent}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.rowTitle, { color: theme.text.primary }]}
                          numberOfLines={1}>
                          {folder.name}
                        </Text>
                        <Text style={[styles.rowSubtitle, { color: theme.text.secondary }]}>
                          {folder.animeCount} item
                          {folder.animeCount === 1 ? '' : 's'}
                          {folder.isSystemFolder ? ' · System folder' : ''}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={theme.text.tertiary} />
                    </Pressable>
                  );
                }
                const anime = item.anime;
                return (
                  <Pressable
                    onPress={() => handleSelectAnime(anime)}
                    style={({ pressed }) => [
                      styles.row,
                      {
                        backgroundColor: theme.background.secondary,
                        borderColor: theme.glassBorder,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}>
                    <View style={[styles.iconBubble, { backgroundColor: theme.secondary + '24' }]}>
                      <MaterialIcons name="play-circle-outline" size={18} color={theme.secondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.rowTitle, { color: theme.text.primary }]}
                        numberOfLines={1}>
                        {anime.title}
                      </Text>
                      <View style={styles.folderBadge}>
                        <MaterialIcons name="folder" size={12} color={theme.text.tertiary} />
                        <Text
                          style={[styles.rowSubtitle, { color: theme.text.secondary }]}
                          numberOfLines={1}>
                          {anime.folderName}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.text.tertiary} />
                  </Pressable>
                );
              }}
            />
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    ...Typography.bodyMedium,
    paddingVertical: 0,
  },
  cancel: {
    paddingHorizontal: 4,
  },
  cancelText: {
    ...Typography.titleSmall,
    fontWeight: '700',
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.titleLarge,
  },
  sectionTitleInline: {
    marginTop: Spacing.sm,
    marginBottom: 2,
  },
  clearText: {
    ...Typography.titleSmall,
    fontWeight: '600',
  },
  recentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    maxWidth: 220,
  },
  recentText: {
    ...Typography.bodySmall,
  },
  emptyHint: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
    gap: 8,
  },
  emptyHintTitle: {
    ...Typography.titleLarge,
  },
  emptyHintBody: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    maxWidth: 320,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    ...Typography.titleMedium,
  },
  rowSubtitle: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  folderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
});
