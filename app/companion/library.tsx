// Character album (Track D Phase 2) — the home for managing companion
// characters and their angle variants. Reached from the pilgrimage navbar's
// people icon and the pilgrimage album's "My characters" section.
//
// Each card is a character (one or more angle variants folded together). Tap a
// card to manage its angles (add / delete), rename it, or delete the whole
// character. Importing runs the subject lifter (去背); when no subject is found
// or the device can't segment, the original is kept and honestly badged
// "Original" rather than faking a cut-out (CLAUDE.md rule 8).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText, ThemedButton, readableTextOn } from '../../components/themed';
import { Radius, Spacing, bottomPad } from '../../constants/DesignSystem';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { useT } from '../../libs/i18n';
import {
  deleteCharacter,
  deleteCharacterGroup,
  getCharacterCount,
  getCharacterGroups,
  getCharacterLimit,
  renameCharacterGroup,
  subscribeCharacters,
  upsertCharacter,
} from '../../libs/services/companion/character-library-store';
import type { CharacterGroup } from '../../libs/services/companion/character-library';
import { importCharacterFromLibrary } from '../../libs/services/companion/import-character';

export default function CompanionLibraryScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const styles = makeStyles(theme);
  const accent = theme.accent;
  const accentFg = readableTextOn(accent);
  const limit = getCharacterLimit();

  const [groups, setGroups] = useState<CharacterGroup[]>(() => getCharacterGroups());
  const [used, setUsed] = useState<number>(() => getCharacterCount());
  const [importing, setImporting] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ groupId: string; text: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeCharacters(() => {
        setGroups(getCharacterGroups());
        setUsed(getCharacterCount());
      }),
    []
  );

  const detailGroup = useMemo(
    () => groups.find((g) => g.groupId === detailId) ?? null,
    [groups, detailId]
  );

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const runImport = useCallback(
    async (opts: { groupId?: string; displayName?: string }) => {
      if (importing) return;
      setImporting(true);
      try {
        const outcome = await importCharacterFromLibrary(opts);
        if (outcome.status === 'denied') {
          flashToast(t('companion.permissionDenied'));
          return;
        }
        if (outcome.status === 'cancelled') return;
        const ok = upsertCharacter(outcome.entry);
        if (!ok) {
          flashToast(t('companion.libraryFull', { limit }));
          return;
        }
        hapticsBridge.success();
        if (!outcome.cutout) flashToast(t('companion.cutoutUnavailableBody'));
      } finally {
        setImporting(false);
      }
    },
    [importing, limit, flashToast, t]
  );

  const confirmDeleteCharacter = useCallback(
    (group: CharacterGroup) => {
      Alert.alert(t('companion.deleteConfirmTitle'), t('companion.deleteConfirmBody'), [
        { text: t('companion.cancel'), style: 'cancel' },
        {
          text: t('companion.delete'),
          style: 'destructive',
          onPress: () => {
            hapticsBridge.warning();
            deleteCharacterGroup(group.groupId);
            setDetailId(null);
          },
        },
      ]);
    },
    [t]
  );

  const handleDeleteAngle = useCallback((id: string, group: CharacterGroup) => {
    hapticsBridge.warning();
    // Removing the final angle deletes the character; close the sheet then.
    if (group.variants.length <= 1) {
      deleteCharacterGroup(group.groupId);
      setDetailId(null);
    } else {
      deleteCharacter(id);
    }
  }, []);

  const submitRename = useCallback(() => {
    if (!renaming) return;
    renameCharacterGroup(renaming.groupId, renaming.text);
    setRenaming(null);
  }, [renaming]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text.primary} />
          </Pressable>
          <View style={styles.headerCenter}>
            <ThemedText variant="titleLarge" weight="700">
              {t('companion.title')}
            </ThemedText>
            <ThemedText variant="captionSmall" tone="secondary">
              {t('companion.count', { used, limit })}
            </ThemedText>
          </View>
          <View style={styles.headerBtn} />
        </View>

        {groups.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.background.secondary }]}>
              <Ionicons name="people-outline" size={40} color={theme.text.secondary} />
            </View>
            <ThemedText variant="titleMedium" weight="700" style={styles.emptyTitle}>
              {t('companion.empty.title')}
            </ThemedText>
            <ThemedText variant="bodySmall" tone="secondary" style={styles.emptyBody}>
              {t('companion.empty.body')}
            </ThemedText>
            <ThemedButton
              label={importing ? t('companion.importing') : t('companion.empty.cta')}
              icon={<Ionicons name="add" size={18} color={accentFg} />}
              onPress={() => runImport({})}
              disabled={importing}
              loading={importing}
              size="lg"
            />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.gridWrap, { paddingBottom: bottomPad(insets) + 96 }]}
            showsVerticalScrollIndicator={false}>
            {groups.map((group) => (
              <CharacterCard
                key={group.groupId}
                group={group}
                theme={theme}
                t={t}
                onPress={() => {
                  hapticsBridge.selection();
                  setDetailId(group.groupId);
                }}
              />
            ))}
          </ScrollView>
        )}

        {groups.length > 0 ? (
          <View style={[styles.fabWrap, { bottom: bottomPad(insets) + 16 }]}>
            <ThemedButton
              label={importing ? t('companion.importing') : t('companion.import')}
              icon={<Ionicons name="add" size={18} color={accentFg} />}
              onPress={() => runImport({})}
              disabled={importing || used >= limit}
              loading={importing}
              size="lg"
            />
          </View>
        ) : null}

        {toast ? (
          <View pointerEvents="none" style={[styles.toastWrap, { bottom: insets.bottom + 120 }]}>
            <View
              style={[
                styles.toast,
                { backgroundColor: theme.background.tertiary, borderColor: theme.glassBorder },
              ]}>
              <ThemedText variant="bodySmall" weight="700">
                {toast}
              </ThemedText>
            </View>
          </View>
        ) : null}
      </SafeAreaView>

      {/* Per-character management sheet */}
      <Modal
        visible={detailGroup !== null}
        animationType="slide"
        transparent={false}
        statusBarTranslucent
        onRequestClose={() => setDetailId(null)}>
        {detailGroup ? (
          <CharacterDetailSheet
            group={detailGroup}
            theme={theme}
            t={t}
            importing={importing}
            atLimit={used >= limit}
            onClose={() => setDetailId(null)}
            onAddAngle={() =>
              runImport({ groupId: detailGroup.groupId, displayName: detailGroup.name })
            }
            onRename={() => setRenaming({ groupId: detailGroup.groupId, text: detailGroup.name })}
            onDeleteAngle={(id) => handleDeleteAngle(id, detailGroup)}
            onDeleteCharacter={() => confirmDeleteCharacter(detailGroup)}
          />
        ) : (
          <View />
        )}
      </Modal>

      {/* Rename dialog */}
      <Modal
        visible={renaming !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setRenaming(null)}>
        <Pressable style={styles.dialogScrim} onPress={() => setRenaming(null)}>
          <Pressable
            style={[
              styles.dialog,
              { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
            ]}>
            <ThemedText variant="titleMedium" weight="700">
              {t('companion.renameTitle')}
            </ThemedText>
            <TextInput
              value={renaming?.text ?? ''}
              onChangeText={(text) => setRenaming((r) => (r ? { ...r, text } : r))}
              placeholder={t('companion.namePlaceholder')}
              placeholderTextColor={theme.text.tertiary}
              autoFocus
              style={[
                styles.input,
                {
                  color: theme.text.primary,
                  backgroundColor: theme.background.tertiary,
                  borderColor: theme.glassBorder,
                },
              ]}
            />
            <View style={styles.dialogActions}>
              <View style={{ flex: 1 }}>
                <ThemedButton
                  variant="secondary"
                  label={t('companion.cancel')}
                  onPress={() => setRenaming(null)}
                  fullWidth
                />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedButton label={t('companion.save')} onPress={submitRename} fullWidth />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function CharacterCard({
  group,
  theme,
  t,
  onPress,
}: {
  group: CharacterGroup;
  theme: ThemePalette;
  t: ReturnType<typeof useT>;
  onPress: () => void;
}) {
  const styles = makeStyles(theme);
  const count = group.variants.length;
  const cut = group.cover.hasAlpha === true;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('companion.openA11y', { name: group.name })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
      <View style={[styles.cardThumb, { backgroundColor: theme.background.tertiary }]}>
        <ExpoImage
          source={{ uri: group.cover.thumbUri }}
          style={StyleSheet.absoluteFillObject}
          contentFit="contain"
        />
        <View
          style={[
            styles.cutBadge,
            {
              backgroundColor: cut ? theme.accent : theme.background.primary,
              borderColor: cut ? theme.accent : theme.glassBorder,
            },
          ]}>
          <Ionicons
            name={cut ? 'sparkles' : 'image-outline'}
            size={10}
            color={cut ? readableTextOn(theme.accent) : theme.text.secondary}
          />
          <ThemedText
            variant="captionSmall"
            weight="700"
            style={{ color: cut ? readableTextOn(theme.accent) : theme.text.secondary }}>
            {cut ? t('companion.cutoutBadge') : t('companion.notCutOut')}
          </ThemedText>
        </View>
      </View>
      <ThemedText variant="bodySmall" weight="700" numberOfLines={1} style={styles.cardName}>
        {group.name}
      </ThemedText>
      <ThemedText variant="captionSmall" tone="secondary">
        {count === 1 ? t('companion.oneAngle') : t('companion.anglesCount', { count })}
      </ThemedText>
    </Pressable>
  );
}

function CharacterDetailSheet({
  group,
  theme,
  t,
  importing,
  atLimit,
  onClose,
  onAddAngle,
  onRename,
  onDeleteAngle,
  onDeleteCharacter,
}: {
  group: CharacterGroup;
  theme: ThemePalette;
  t: ReturnType<typeof useT>;
  importing: boolean;
  atLimit: boolean;
  onClose: () => void;
  onAddAngle: () => void;
  onRename: () => void;
  onDeleteAngle: (id: string) => void;
  onDeleteCharacter: () => void;
}) {
  const styles = makeStyles(theme);
  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.root, { backgroundColor: theme.background.primary }]}>
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.6 }]}>
          <Ionicons name="chevron-down" size={24} color={theme.text.primary} />
        </Pressable>
        <Pressable
          onPress={onRename}
          accessibilityRole="button"
          accessibilityLabel={t('companion.rename')}
          style={({ pressed }) => [styles.titleRow, pressed && { opacity: 0.6 }]}>
          <ThemedText variant="titleLarge" weight="700" numberOfLines={1}>
            {group.name}
          </ThemedText>
          <Ionicons name="pencil" size={15} color={theme.text.secondary} />
        </Pressable>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.detailScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.angleGrid}>
          {group.variants.map((variant) => (
            <View key={variant.id} style={styles.angleTileWrap}>
              <View style={[styles.angleTile, { backgroundColor: theme.background.tertiary }]}>
                <ExpoImage
                  source={{ uri: variant.thumbUri }}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="contain"
                />
                {variant.hasAlpha !== true ? (
                  <View
                    style={[
                      styles.angleOriginalTag,
                      { backgroundColor: theme.background.primary, borderColor: theme.glassBorder },
                    ]}>
                    <ThemedText variant="captionSmall" weight="700" tone="secondary">
                      {t('companion.notCutOut')}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
              <Pressable
                onPress={() => onDeleteAngle(variant.id)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('companion.deleteAngleA11y')}
                style={({ pressed }) => [
                  styles.angleDelete,
                  {
                    backgroundColor: theme.background.tertiary,
                    borderColor: theme.glassBorder,
                    opacity: pressed ? 0.6 : 1,
                  },
                ]}>
                <Ionicons name="trash-outline" size={13} color={theme.text.secondary} />
              </Pressable>
            </View>
          ))}

          <Pressable
            onPress={onAddAngle}
            disabled={importing || atLimit}
            accessibilityRole="button"
            accessibilityLabel={t('companion.addAngle')}
            style={({ pressed }) => [
              styles.addAngleTile,
              {
                borderColor: theme.glassBorder,
                backgroundColor: theme.background.secondary,
                opacity: importing || atLimit ? 0.45 : pressed ? 0.8 : 1,
              },
            ]}>
            <Ionicons name="add" size={26} color={theme.accent} />
            <ThemedText variant="captionSmall" weight="700" tone="secondary">
              {importing ? t('companion.importing') : t('companion.addAngle')}
            </ThemedText>
          </Pressable>
        </View>

        <ThemedButton
          variant="destructive"
          label={t('companion.delete')}
          onPress={onDeleteCharacter}
          size="md"
          fullWidth
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background.primary },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    headerBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
    titleRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    emptyWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.xl,
      gap: 14,
    },
    emptyIcon: {
      width: 92,
      height: 92,
      borderRadius: 46,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: { textAlign: 'center' },
    emptyBody: { textAlign: 'center', lineHeight: 20 },
    gridWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.md,
      padding: Spacing.md,
    },
    card: { width: '47%', gap: 4 },
    cardThumb: {
      width: '100%',
      aspectRatio: 0.78,
      borderRadius: Radius.md,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    cutBadge: {
      position: 'absolute',
      top: 6,
      left: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: 1,
    },
    cardName: { marginTop: 2 },
    fabWrap: {
      position: 'absolute',
      left: Spacing.md,
      right: Spacing.md,
    },
    toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
    toast: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      maxWidth: '86%',
    },
    // detail sheet
    detailScroll: { padding: Spacing.md, gap: Spacing.lg },
    angleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    angleTileWrap: { width: '30%' },
    angleTile: {
      width: '100%',
      aspectRatio: 0.78,
      borderRadius: Radius.sm,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    angleOriginalTag: {
      position: 'absolute',
      bottom: 4,
      left: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      borderWidth: 1,
    },
    angleDelete: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    addAngleTile: {
      width: '30%',
      aspectRatio: 0.78,
      borderRadius: Radius.sm,
      borderWidth: 1,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    dialogScrim: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.xl,
    },
    dialog: {
      width: '100%',
      borderRadius: Radius.lg,
      borderWidth: 1,
      padding: Spacing.lg,
      gap: Spacing.md,
    },
    input: {
      borderWidth: 1,
      borderRadius: Radius.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
    },
    dialogActions: { flexDirection: 'row', gap: Spacing.sm },
  });
}
