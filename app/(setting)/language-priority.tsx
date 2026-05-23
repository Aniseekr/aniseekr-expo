import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { SettingsScreenLayout } from '../../components/setting/SettingsScreenLayout';
import { safeJsonParse } from '../../libs/utils/safe-json';

import { kvGet, kvSet } from '../../libs/services/storage/app-storage';
import { LANGUAGE_PRIORITY_KEY } from '../../libs/services/storage/keys';

type LanguageId = 'english' | 'romaji' | 'japanese' | 'chinese';

const LANGUAGES: Record<LanguageId, { name: string; icon: string }> = {
  english: { name: 'English', icon: '🇬🇧' },
  romaji: { name: 'Romaji', icon: 'A' },
  japanese: { name: '日本語', icon: '🇯🇵' },
  chinese: { name: '繁體中文', icon: '🇹🇼' },
};

const DEFAULT_ORDER: LanguageId[] = ['english', 'romaji', 'japanese', 'chinese'];

const isLanguageOrder = (value: unknown): value is LanguageId[] =>
  Array.isArray(value) && value.every((id): id is LanguageId => typeof id === 'string' && id in LANGUAGES);

function readOrderSync(): LanguageId[] {
  const parsed = safeJsonParse(kvGet(LANGUAGE_PRIORITY_KEY), isLanguageOrder);
  return parsed ?? DEFAULT_ORDER;
}

export default function LanguagePriorityScreen() {
  const { theme } = useTheme();
  // Sync seed from MMKV — list renders in the user's chosen order on frame 1.
  const [order, setOrder] = useState<LanguageId[]>(readOrderSync);

  const persist = (next: LanguageId[]) => {
    setOrder(next);
    kvSet(LANGUAGE_PRIORITY_KEY, JSON.stringify(next));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    hapticsBridge.selection();
    persist(next);
  };

  const reset = () => {
    hapticsBridge.warning();
    persist(DEFAULT_ORDER);
  };

  return (
    <SettingsScreenLayout
      title="Title language"
      subtitle="Choose how anime titles appear"
      rightSlot={
        <Pressable onPress={reset} hitSlop={12}>
          <MaterialIcons name="restore" size={22} color={theme.text.secondary} />
        </Pressable>
      }>
      <Text style={[styles.intro, { color: theme.text.secondary }]}>
        Titles will be shown in the highest-priority language available for each anime. Tap the
        arrows to reorder.
      </Text>
      <View
        style={[
          styles.list,
          {
            backgroundColor: theme.background.secondary,
            borderColor: theme.glassBorder,
          },
        ]}>
        {order.map((id, idx) => {
          const lang = LANGUAGES[id];
          return (
            <View key={id}>
              <View style={styles.row}>
                <View style={[styles.priorityBadge, { backgroundColor: theme.accent + '24' }]}>
                  <Text style={[styles.priorityText, { color: theme.accent }]}>{idx + 1}</Text>
                </View>
                <Text style={styles.flag}>{lang.icon}</Text>
                <Text style={[styles.languageName, { color: theme.text.primary }]}>
                  {lang.name}
                </Text>
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => move(idx, -1)}
                    disabled={idx === 0}
                    hitSlop={8}
                    style={[styles.arrowButton, idx === 0 && { opacity: 0.3 }]}>
                    <MaterialIcons name="keyboard-arrow-up" size={22} color={theme.text.primary} />
                  </Pressable>
                  <Pressable
                    onPress={() => move(idx, 1)}
                    disabled={idx === order.length - 1}
                    hitSlop={8}
                    style={[styles.arrowButton, idx === order.length - 1 && { opacity: 0.3 }]}>
                    <MaterialIcons
                      name="keyboard-arrow-down"
                      size={22}
                      color={theme.text.primary}
                    />
                  </Pressable>
                </View>
              </View>
              {idx < order.length - 1 ? (
                <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
              ) : null}
            </View>
          );
        })}
      </View>
    </SettingsScreenLayout>
  );
}

const styles = StyleSheet.create({
  intro: {
    ...Typography.bodyMedium,
    paddingHorizontal: 4,
  },
  list: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm + 2,
  },
  priorityBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityText: {
    ...Typography.titleMedium,
    fontWeight: '800',
  },
  flag: {
    fontSize: 22,
  },
  languageName: {
    ...Typography.titleMedium,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
  },
  arrowButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  divider: {
    height: 1,
    marginLeft: 56,
  },
});
