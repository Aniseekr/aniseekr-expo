import { memo, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { collectionService } from '../../libs/services/collection/collection-service';
import { CollectionFolder } from '../../types';

const ICON_OPTIONS = [
  'folder',
  'star',
  'heart',
  'bookmark',
  'flame',
  'planet',
  'film',
  'tv',
  'game-controller',
  'sparkles',
] as const;

interface FolderPickerProps {
  visible: boolean;
  animeId: string;
  animeTitle: string;
  onClose: () => void;
  onAdded?: (folderId: string) => void;
}

function FolderPickerComponent({
  visible,
  animeId,
  animeTitle,
  onClose,
  onAdded,
}: FolderPickerProps) {
  const { theme } = useTheme();
  const [folders, setFolders] = useState<CollectionFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState<string>('folder');
  const [newR18, setNewR18] = useState(false);

  const loadFolders = useCallback(async () => {
    setLoading(true);
    try {
      const list = await collectionService.getFolders();
      setFolders(list);
    } catch (e) {
      console.warn('[FolderPicker] failed to load folders:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadFolders();
      setShowCreate(false);
      setNewName('');
      setNewIcon('folder');
      setNewR18(false);
    }
  }, [visible, loadFolders]);

  const handleAdd = async (folder: CollectionFolder) => {
    setAdding(folder.id);
    try {
      await collectionService.addToFolder(animeId, folder.id);
      hapticsBridge.success();
      onAdded?.(folder.id);
      onClose();
    } catch (e) {
      console.warn('[FolderPicker] failed to add:', e);
      hapticsBridge.error();
    } finally {
      setAdding(null);
    }
  };

  const handleCreateAndAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding('__new');
    try {
      await collectionService.createCustomFolder(name, newIcon, false, newR18);
      const list = await collectionService.getFolders();
      const created = list.find((f) => f.name === name && f.icon === newIcon && !f.isSystemFolder);
      if (created) {
        await collectionService.addToFolder(animeId, created.id);
        onAdded?.(created.id);
      }
      hapticsBridge.success();
      onClose();
    } catch (e) {
      console.warn('[FolderPicker] failed to create+add:', e);
      hapticsBridge.error();
    } finally {
      setAdding(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(160)}
        style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          entering={FadeInUp.springify().damping(18)}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
            },
          ]}>
          <SafeAreaView edges={['bottom']} style={{ maxHeight: '90%' }}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: theme.text.primary }]}>Add to folder</Text>
                <Text style={[styles.subtitle, { color: theme.text.secondary }]} numberOfLines={1}>
                  {animeTitle}
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={12}>
                <MaterialIcons name="close" size={22} color={theme.text.secondary} />
              </Pressable>
            </View>

            {showCreate ? (
              <View>
                <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>
                  New folder name
                </Text>
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="e.g. Best of 2025"
                  placeholderTextColor={theme.text.tertiary}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.background.tertiary,
                      borderColor: theme.glassBorder,
                      color: theme.text.primary,
                    },
                  ]}
                />
                <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>Icon</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.iconRow}>
                  {ICON_OPTIONS.map((icon) => {
                    const active = icon === newIcon;
                    return (
                      <Pressable
                        key={icon}
                        onPress={() => {
                          hapticsBridge.selection();
                          setNewIcon(icon);
                        }}
                        style={[
                          styles.iconBubble,
                          {
                            backgroundColor: active ? theme.accent : theme.background.tertiary,
                            borderColor: active ? theme.accent : theme.glassBorder,
                          },
                        ]}>
                        <Ionicons
                          name={icon}
                          size={20}
                          color={active ? '#0E0A06' : theme.text.primary}
                        />
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Pressable
                  onPress={() => {
                    hapticsBridge.selection();
                    setNewR18(!newR18);
                  }}
                  style={[styles.r18Row, { borderColor: theme.glassBorder }]}>
                  <MaterialIcons
                    name={newR18 ? 'check-box' : 'check-box-outline-blank'}
                    size={20}
                    color={newR18 ? theme.accent : theme.text.tertiary}
                  />
                  <Text style={[styles.r18Label, { color: theme.text.primary }]}>
                    Folder contains R18 content
                  </Text>
                </Pressable>

                <View style={styles.footerRow}>
                  <Pressable
                    onPress={() => setShowCreate(false)}
                    style={[
                      styles.footerButton,
                      styles.cancelButton,
                      { borderColor: theme.glassBorder },
                    ]}>
                    <Text style={[styles.cancelLabel, { color: theme.text.secondary }]}>Back</Text>
                  </Pressable>
                  <Pressable
                    disabled={!newName.trim() || adding !== null}
                    onPress={handleCreateAndAdd}
                    style={({ pressed }) => [
                      styles.footerButton,
                      {
                        backgroundColor: theme.accent,
                        opacity: !newName.trim() || adding !== null ? 0.5 : pressed ? 0.85 : 1,
                      },
                    ]}>
                    {adding === '__new' ? (
                      <ActivityIndicator color="#0E0A06" />
                    ) : (
                      <Text style={styles.confirmLabel}>Create & add</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                {loading ? (
                  <View style={styles.loadingWrap}>
                    <ActivityIndicator color={theme.accent} />
                  </View>
                ) : (
                  <ScrollView style={{ maxHeight: 360 }}>
                    {folders.map((folder) => (
                      <Pressable
                        key={folder.id}
                        onPress={() => handleAdd(folder)}
                        disabled={adding !== null}
                        style={({ pressed }) => [
                          styles.folderRow,
                          {
                            backgroundColor: theme.background.tertiary,
                            borderColor: theme.glassBorder,
                            opacity: pressed ? 0.85 : 1,
                          },
                        ]}>
                        <View style={[styles.folderIcon, { backgroundColor: theme.accent + '24' }]}>
                          <Ionicons name={folder.icon as any} size={20} color={theme.accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.folderName, { color: theme.text.primary }]}>
                            {folder.name}
                          </Text>
                          <Text style={[styles.folderMeta, { color: theme.text.tertiary }]}>
                            {folder.isSystemFolder ? 'System' : 'Custom'}
                            {folder.isR18 ? ' · R18' : ''}
                          </Text>
                        </View>
                        {adding === folder.id ? (
                          <ActivityIndicator color={theme.accent} />
                        ) : (
                          <MaterialIcons name="add-circle" size={22} color={theme.accent} />
                        )}
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
                <Pressable
                  onPress={() => {
                    hapticsBridge.tap();
                    setShowCreate(true);
                  }}
                  style={[styles.createNew, { borderColor: theme.glassBorder }]}>
                  <MaterialIcons name="create-new-folder" size={20} color={theme.accent} />
                  <Text style={[styles.createNewLabel, { color: theme.accent }]}>
                    Create new folder
                  </Text>
                </Pressable>
              </>
            )}
          </SafeAreaView>
        </Animated.View>
      </Animated.View>
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.headlineSmall,
  },
  subtitle: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  sectionLabel: {
    ...Typography.captionSmall,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.sm,
    ...Typography.bodyMedium,
  },
  iconRow: {
    gap: 8,
    paddingVertical: 4,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  r18Row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
    borderTopWidth: 1,
  },
  r18Label: {
    ...Typography.bodyMedium,
  },
  loadingWrap: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  folderIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderName: {
    ...Typography.titleMedium,
  },
  folderMeta: {
    ...Typography.captionSmall,
    marginTop: 2,
  },
  createNew: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    marginTop: Spacing.sm,
  },
  createNewLabel: {
    ...Typography.titleMedium,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  footerButton: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  cancelLabel: {
    ...Typography.titleMedium,
  },
  confirmLabel: {
    ...Typography.titleMedium,
    color: '#0E0A06',
    fontWeight: '700',
  },
});

export const FolderPicker = memo(FolderPickerComponent);
