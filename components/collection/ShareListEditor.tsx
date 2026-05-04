import { memo, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Spacing, Typography, Radius } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import type {
  ShareEntry,
  ShareSourceItem,
  ShareTemplateBuild,
} from '../../libs/services/collection/share-templates';

interface ShareListEditorProps {
  visible: boolean;
  build: ShareTemplateBuild | null;
  source: ShareSourceItem[];
  onClose: () => void;
  onSave: (entries: ShareEntry[]) => void;
}

function ShareListEditorComponent({
  visible,
  build,
  source,
  onClose,
  onSave,
}: ShareListEditorProps) {
  const { theme } = useTheme();
  const [entries, setEntries] = useState<ShareEntry[]>([]);
  const [query, setQuery] = useState('');
  const [pickerVisible, setPickerVisible] = useState(false);

  useEffect(() => {
    if (visible && build) {
      setEntries(build.entries);
      setQuery('');
    }
  }, [visible, build]);

  const limit = useMemo(() => {
    if (!build) return 10;
    if (build.template.id === 'starter_pack') return 6;
    if (build.template.id === 'masterpiece') return 1;
    if (build.template.id === 'top10') return 10;
    return 12;
  }, [build]);

  const moveUp = (idx: number) => {
    if (idx <= 0) return;
    hapticsBridge.selection();
    setEntries((prev) => {
      const next = [...prev];
      const tmp = next[idx - 1];
      next[idx - 1] = next[idx];
      next[idx] = tmp;
      return next;
    });
  };

  const moveDown = (idx: number) => {
    setEntries((prev) => {
      if (idx >= prev.length - 1) return prev;
      hapticsBridge.selection();
      const next = [...prev];
      const tmp = next[idx + 1];
      next[idx + 1] = next[idx];
      next[idx] = tmp;
      return next;
    });
  };

  const remove = (idx: number) => {
    hapticsBridge.tap();
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  const addEntry = (item: ShareSourceItem) => {
    hapticsBridge.success();
    const tag = build?.entries.find((e) => e.animeId === item.id)?.tag;
    setEntries((prev) => {
      if (prev.find((e) => e.animeId === item.id)) return prev;
      const next = [
        ...prev,
        {
          animeId: item.id,
          title: item.title,
          coverUrl: item.coverUrl,
          score: item.score,
          year: item.year,
          synopsis: item.synopsis,
          tag,
        },
      ];
      return next.slice(0, limit);
    });
    setPickerVisible(false);
  };

  const filteredSource = useMemo(() => {
    const taken = new Set(entries.map((e) => e.animeId));
    const q = query.trim().toLowerCase();
    return source
      .filter((it) => !taken.has(it.id))
      .filter((it) => (q ? it.title.toLowerCase().includes(q) : true))
      .slice(0, 80);
  }, [entries, source, query]);

  const handleSave = () => {
    hapticsBridge.success();
    onSave(entries);
  };

  if (!build) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
            },
          ]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: theme.text.primary }]}>
                {build.template.title}
              </Text>
              <Text style={[styles.subtitle, { color: theme.text.secondary }]}>
                {entries.length}/{limit} picks
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <MaterialIcons name="close" size={24} color={theme.text.primary} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={entries}
            keyExtractor={(e, i) => `${e.animeId}-${i}`}
            ItemSeparatorComponent={() => <View style={{ height: Spacing.xs }} />}
            renderItem={({ item, index }) => (
              <View
                style={[
                  styles.row,
                  {
                    backgroundColor: theme.background.tertiary,
                    borderColor: theme.glassBorder,
                  },
                ]}>
                <Text style={[styles.rowIndex, { color: theme.text.secondary }]}>{index + 1}</Text>
                {item.coverUrl ? (
                  <Image source={{ uri: item.coverUrl }} style={styles.cover} contentFit="cover" />
                ) : (
                  <View style={[styles.cover, styles.coverFallback]}>
                    <MaterialIcons name="image" size={20} color={theme.text.tertiary} />
                  </View>
                )}
                <View style={styles.meta}>
                  <Text style={[styles.metaTitle, { color: theme.text.primary }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <View style={styles.metaSubRow}>
                    {item.year ? (
                      <Text style={[styles.metaSub, { color: theme.text.secondary }]}>
                        {item.year}
                      </Text>
                    ) : null}
                    {typeof item.score === 'number' ? (
                      <Text style={[styles.metaSub, { color: theme.text.secondary }]}>
                        ★ {(item.score / 10).toFixed(1)}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity
                    onPress={() => moveUp(index)}
                    hitSlop={8}
                    disabled={index === 0}>
                    <MaterialIcons
                      name="arrow-upward"
                      size={20}
                      color={index === 0 ? theme.text.tertiary : theme.text.primary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => moveDown(index)}
                    hitSlop={8}
                    disabled={index === entries.length - 1}>
                    <MaterialIcons
                      name="arrow-downward"
                      size={20}
                      color={
                        index === entries.length - 1 ? theme.text.tertiary : theme.text.primary
                      }
                    />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => remove(index)} hitSlop={8}>
                    <MaterialIcons name="delete-outline" size={20} color={theme.text.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: theme.text.secondary }]}>
                No picks yet. Tap “Add anime” below.
              </Text>
            }
            style={styles.list}
            contentContainerStyle={{ paddingBottom: Spacing.md }}
          />

          <View style={styles.footer}>
            <Pressable
              onPress={() => {
                hapticsBridge.tap();
                setPickerVisible(true);
              }}
              disabled={entries.length >= limit}
              style={({ pressed }) => [
                styles.footerButton,
                {
                  backgroundColor: theme.background.tertiary,
                  borderColor: theme.glassBorder,
                  opacity: entries.length >= limit ? 0.5 : pressed ? 0.85 : 1,
                },
              ]}>
              <MaterialIcons name="add" size={18} color={theme.text.primary} />
              <Text style={[styles.footerButtonText, { color: theme.text.primary }]}>
                Add anime
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={entries.length === 0}
              style={({ pressed }) => [
                styles.footerButton,
                {
                  backgroundColor: theme.accent,
                  borderColor: theme.accent,
                  opacity: entries.length === 0 ? 0.5 : pressed ? 0.85 : 1,
                },
              ]}>
              <MaterialIcons name="check" size={18} color="#0E0A06" />
              <Text style={[styles.footerButtonText, { color: '#0E0A06' }]}>Save</Text>
            </Pressable>
          </View>
        </View>

        <Modal
          visible={pickerVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setPickerVisible(false)}>
          <View style={styles.overlay}>
            <View
              style={[
                styles.sheet,
                {
                  backgroundColor: theme.background.secondary,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <View style={styles.header}>
                <Text style={[styles.title, { color: theme.text.primary }]}>Pick anime</Text>
                <TouchableOpacity onPress={() => setPickerVisible(false)} hitSlop={8}>
                  <MaterialIcons name="close" size={24} color={theme.text.primary} />
                </TouchableOpacity>
              </View>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search your collection"
                placeholderTextColor={theme.text.tertiary}
                style={[
                  styles.search,
                  {
                    backgroundColor: theme.background.tertiary,
                    borderColor: theme.glassBorder,
                    color: theme.text.primary,
                  },
                ]}
              />
              <FlatList
                data={filteredSource}
                keyExtractor={(it) => it.id}
                style={styles.list}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => addEntry(item)}
                    style={({ pressed }) => [
                      styles.row,
                      {
                        backgroundColor: theme.background.tertiary,
                        borderColor: theme.glassBorder,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}>
                    {item.coverUrl ? (
                      <Image
                        source={{ uri: item.coverUrl }}
                        style={styles.cover}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[styles.cover, styles.coverFallback]}>
                        <MaterialIcons name="image" size={20} color={theme.text.tertiary} />
                      </View>
                    )}
                    <View style={styles.meta}>
                      <Text
                        style={[styles.metaTitle, { color: theme.text.primary }]}
                        numberOfLines={2}>
                        {item.title}
                      </Text>
                      <View style={styles.metaSubRow}>
                        {item.year ? (
                          <Text style={[styles.metaSub, { color: theme.text.secondary }]}>
                            {item.year}
                          </Text>
                        ) : null}
                        {typeof item.score === 'number' ? (
                          <Text style={[styles.metaSub, { color: theme.text.secondary }]}>
                            ★ {(item.score / 10).toFixed(1)}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <MaterialIcons name="add" size={22} color={theme.accent} />
                  </Pressable>
                )}
                ItemSeparatorComponent={() => <View style={{ height: Spacing.xs }} />}
                ListEmptyComponent={
                  <Text style={[styles.empty, { color: theme.text.secondary }]}>
                    No matching anime in your collection.
                  </Text>
                }
                contentContainerStyle={{ paddingBottom: Spacing.md }}
              />
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.headlineSmall,
    fontWeight: '700',
  },
  subtitle: {
    ...Typography.captionSmall,
    marginTop: 2,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  rowIndex: {
    ...Typography.titleSmall,
    width: 22,
    textAlign: 'center',
    fontWeight: '700',
  },
  cover: {
    width: 40,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#222',
  },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    flex: 1,
  },
  metaTitle: {
    ...Typography.titleSmall,
    fontWeight: '600',
  },
  metaSubRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  metaSub: {
    ...Typography.captionSmall,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  empty: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  footerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 22,
    borderWidth: 1,
  },
  footerButtonText: {
    ...Typography.titleSmall,
    fontWeight: '700',
  },
  search: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    ...Typography.bodyMedium,
  },
});

export const ShareListEditor = memo(ShareListEditorComponent);
