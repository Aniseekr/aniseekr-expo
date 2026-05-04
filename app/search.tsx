import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Anime } from '../components/rate/types';
import { AnimeRepository } from '../libs/repositories/anime-repository';
import { ProgressiveImage } from '../components/common/ProgressiveImage';
import { ShimmerEffect } from '../components/common/ShimmerEffect';
import { EmptyStateView } from '../components/common/EmptyStateView';
import { ErrorStateView } from '../components/common/ErrorStateView';
import { Spacing, Typography } from '../constants/DesignSystem';
import { useTheme } from '../context/ThemeContext';
import { hapticsBridge } from '../modules/haptics/hapticsBridge';

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

const RECENT_KEY = '@aniseekr/search/recent';
const MAX_RECENT = 8;
const DEBOUNCE_MS = 320;

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((v) => {
        if (v) {
          try {
            const parsed = JSON.parse(v);
            if (Array.isArray(parsed)) setRecent(parsed.slice(0, MAX_RECENT));
          } catch {
            // ignore parse error
          }
        }
      })
      .catch(() => {});
  }, []);

  const persistRecent = useCallback(async (next: string[]) => {
    try {
      await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await AnimeRepository.searchAnime(trimmed, 1);
      setResults(data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch(query);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const handleSelect = useCallback(
    (anime: Anime) => {
      hapticsBridge.tap();
      const next = [anime.title, ...recent.filter((r) => r !== anime.title)].slice(0, MAX_RECENT);
      setRecent(next);
      persistRecent(next);
      Keyboard.dismiss();
      router.push(`/(rate)/anime/${anime.id}`);
    },
    [recent, persistRecent, router]
  );

  const handleRecentTap = useCallback((term: string) => {
    hapticsBridge.selection();
    setQuery(term);
  }, []);

  const handleClearRecent = useCallback(async () => {
    hapticsBridge.warning();
    setRecent([]);
    await persistRecent([]);
  }, [persistRecent]);

  const handleClose = () => {
    hapticsBridge.tap();
    router.back();
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background.primary }]}>
      <Stack.Screen options={{ headerShown: false }} />
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
              autoFocus
              placeholder="Search anime, characters, studios..."
              placeholderTextColor={theme.text.tertiary}
              value={query}
              onChangeText={setQuery}
              style={[styles.input, { color: theme.text.primary }]}
              returnKeyType="search"
              onSubmitEditing={() => runSearch(query)}
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
            <Text style={[styles.cancelText, { color: theme.accent }]}>Cancel</Text>
          </Pressable>
        </View>

        {error ? (
          <ErrorStateView title="Search failed" message={error} onRetry={() => runSearch(query)} />
        ) : query.length === 0 ? (
          <ScrollView
            contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
            keyboardShouldPersistTaps="handled">
            {recent.length > 0 ? (
              <View style={styles.recentSection}>
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
              <EmptyStateView
                icon="search"
                title="Discover anime"
                description="Search across all your connected platforms — AniList, MAL, Bangumi, Kitsu and more."
              />
            )}
          </ScrollView>
        ) : loading && results.length === 0 ? (
          <ScrollView
            contentContainerStyle={{
              padding: Spacing.md,
              paddingBottom: insets.bottom + 100,
            }}
            keyboardShouldPersistTaps="handled">
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={styles.skeletonRow}>
                <ShimmerEffect width={64} height={88} borderRadius={10} />
                <View style={{ flex: 1, gap: 8 }}>
                  <ShimmerEffect width="80%" height={16} />
                  <ShimmerEffect width="50%" height={12} />
                  <ShimmerEffect width="35%" height={12} />
                </View>
              </View>
            ))}
          </ScrollView>
        ) : results.length === 0 ? (
          <EmptyStateView
            icon="search-off"
            title="No matches"
            description={`Nothing for "${query}". Try a different keyword or check spelling.`}
          />
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              padding: Spacing.md,
              paddingBottom: insets.bottom + 100,
              gap: Spacing.sm,
            }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleSelect(item)}
                style={({ pressed }) => [
                  styles.resultRow,
                  {
                    backgroundColor: theme.background.secondary,
                    borderColor: theme.glassBorder,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}>
                <ProgressiveImage
                  source={{ uri: item.image }}
                  containerStyle={styles.thumb}
                  borderRadius={10}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: theme.text.primary }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <View style={styles.metaRow}>
                    {item.format ? (
                      <Text style={[styles.meta, { color: theme.text.secondary }]}>
                        {item.format}
                      </Text>
                    ) : null}
                    {item.startDate?.year ? (
                      <Text style={[styles.meta, { color: theme.text.secondary }]}>
                        · {item.startDate.year}
                      </Text>
                    ) : null}
                    {typeof item.score === 'number' ? (
                      <Text style={[styles.score, { color: theme.accent }]}>
                        ★ {(item.score / 10).toFixed(1)}
                      </Text>
                    ) : null}
                  </View>
                  {item.tags?.length ? (
                    <Text style={[styles.tags, { color: theme.text.tertiary }]} numberOfLines={1}>
                      {item.tags.slice(0, 4).join(' · ')}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.text.tertiary} />
              </Pressable>
            )}
            ListFooterComponent={
              loading ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator color={theme.accent} />
                </View>
              ) : null
            }
          />
        )}
      </SafeAreaView>
    </View>
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
  recentSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
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
  skeletonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    alignItems: 'center',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
  },
  thumb: {
    width: 56,
    height: 78,
  },
  title: {
    ...Typography.titleMedium,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  meta: {
    ...Typography.bodySmall,
  },
  score: {
    ...Typography.titleSmall,
    marginLeft: 8,
    fontWeight: '700',
  },
  tags: {
    ...Typography.captionSmall,
    marginTop: 4,
  },
  footerLoader: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
});
