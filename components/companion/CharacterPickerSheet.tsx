// Companion composer (Track D Phase 1) — pick / import / delete characters.
//
// Modal sheet that lists the MMKV-backed library and offers a single
// "Import…" action that runs ImagePicker → subjectLifter → store.upsert.
// Subscribes to the store via `subscribeCharacters` so other surfaces (the
// future compare integration) stay in sync.

import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText, readableTextOn } from '../themed';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { useTheme } from '../../context/ThemeContext';
import { useT } from '../../libs/i18n';
import {
  deleteCharacter,
  getCharacterLimit,
  getCharacters,
  subscribeCharacters,
  upsertCharacter,
} from '../../libs/services/companion/character-library-store';
import type { CharacterEntry } from '../../libs/services/companion/character-library';
import { importCharacterFromLibrary } from '../../libs/services/companion/import-character';

export type CharacterPickerSheetProps = {
  visible: boolean;
  selectedId: string | null;
  onSelect: (entry: CharacterEntry) => void;
  onClose: () => void;
};

export function CharacterPickerSheet({
  visible,
  selectedId,
  onSelect,
  onClose,
}: CharacterPickerSheetProps) {
  const { theme } = useTheme();
  const t = useT();
  const accent = theme.accent;
  const accentFg = readableTextOn(accent);
  const [list, setList] = useState<CharacterEntry[]>(() => getCharacters());
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const limit = getCharacterLimit();

  useEffect(() => subscribeCharacters(setList), []);

  const handleImport = useCallback(async () => {
    if (importing) return;
    setImporting(true);
    setError(null);
    try {
      const outcome = await importCharacterFromLibrary();
      if (outcome.status === 'denied') {
        setError(t('companion.permissionDenied'));
        return;
      }
      if (outcome.status === 'cancelled') return;
      const ok = upsertCharacter(outcome.entry);
      if (!ok) {
        setError(t('companion.libraryFull', { limit }));
        return;
      }
      hapticsBridge.success();
      // No去背: the entry is already in the library (badged "Original"); keep the
      // sheet open with the notice instead of auto-selecting + closing, which
      // would discard the message the user needs to see.
      if (!outcome.cutout) {
        setError(t('companion.cutoutUnavailableBody'));
        return;
      }
      onSelect(outcome.entry);
    } catch (err) {
      console.warn('[companion] import failed', err);
      setError(t('companion.importFailed'));
    } finally {
      setImporting(false);
    }
  }, [importing, limit, onSelect, t]);

  const handleDelete = useCallback((id: string) => {
    hapticsBridge.warning();
    deleteCharacter(id);
  }, []);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent>
      <SafeAreaView
        edges={['top', 'bottom']}
        style={[styles.root, { backgroundColor: theme.background.primary }]}>
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            style={({ pressed }) => [
              styles.headerBtn,
              {
                backgroundColor: theme.background.secondary,
                borderColor: theme.glassBorder,
                opacity: pressed ? 0.6 : 1,
              },
            ]}>
            <Ionicons name="close" size={20} color={theme.text.primary} />
          </Pressable>
          <ThemedText variant="titleLarge" weight="700">
            {t('companion.title')}
          </ThemedText>
          <ThemedText variant="captionSmall" tone="secondary">
            {t('companion.count', { used: list.length, limit })}
          </ThemedText>
        </View>

        <ScrollView contentContainerStyle={styles.gridWrap} showsVerticalScrollIndicator={false}>
          <Pressable
            onPress={handleImport}
            disabled={importing}
            accessibilityRole="button"
            accessibilityLabel={t('companion.import')}
            style={({ pressed }) => [
              styles.importTile,
              {
                backgroundColor: accent,
                borderColor: accent,
                opacity: importing ? 0.5 : pressed ? 0.85 : 1,
              },
            ]}>
            <Ionicons name="add" size={24} color={accentFg} />
            <ThemedText variant="bodySmall" weight="700" style={{ color: accentFg }}>
              {importing ? t('companion.importing') : t('companion.import')}
            </ThemedText>
          </Pressable>

          {list.map((entry) => {
            const active = entry.id === selectedId;
            return (
              <View key={entry.id} style={styles.tileWrap}>
                <Pressable
                  onPress={() => {
                    hapticsBridge.selection();
                    onSelect(entry);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('companion.openA11y', { name: entry.displayName })}
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.tile,
                    {
                      borderColor: active ? accent : theme.glassBorder,
                      borderWidth: active ? 2 : 1,
                      backgroundColor: theme.background.secondary,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}>
                  <ExpoImage
                    source={{ uri: entry.thumbUri }}
                    style={StyleSheet.absoluteFillObject}
                    contentFit="contain"
                  />
                  {entry.hasAlpha !== true ? (
                    <View
                      style={[
                        styles.originalTag,
                        {
                          backgroundColor: theme.background.primary,
                          borderColor: theme.glassBorder,
                        },
                      ]}>
                      <ThemedText variant="captionSmall" weight="700" tone="secondary">
                        {t('companion.notCutOut')}
                      </ThemedText>
                    </View>
                  ) : null}
                </Pressable>
                <Pressable
                  onPress={() => handleDelete(entry.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t('companion.deleteAngleA11y')}
                  hitSlop={11}
                  style={({ pressed }) => [
                    styles.deleteBtn,
                    {
                      backgroundColor: theme.background.tertiary,
                      borderColor: theme.glassBorder,
                      opacity: pressed ? 0.6 : 1,
                    },
                  ]}>
                  <Ionicons name="trash-outline" size={12} color={theme.text.secondary} />
                </Pressable>
                <ThemedText
                  variant="captionSmall"
                  weight="600"
                  numberOfLines={1}
                  style={styles.tileLabel}>
                  {entry.displayName}
                </ThemedText>
              </View>
            );
          })}
        </ScrollView>

        {error ? (
          <View
            style={[
              styles.errorBar,
              { backgroundColor: theme.status.error, borderColor: theme.status.error },
            ]}>
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: readableTextOn(theme.status.error) }}>
              {error}
            </ThemedText>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  importTile: {
    width: '30%',
    aspectRatio: 0.75,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tileWrap: {
    width: '30%',
    gap: 4,
  },
  tile: {
    width: '100%',
    aspectRatio: 0.75,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  deleteBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  tileLabel: {
    textAlign: 'center',
  },
  originalTag: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  errorBar: {
    margin: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
  },
});
