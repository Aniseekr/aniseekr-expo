import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { SettingsScreenLayout } from '../../components/setting/SettingsScreenLayout';
import { safeJsonParse } from '../../libs/utils/safe-json';

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

const STORAGE_KEY = '@aniseekr/title-language-priority';

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

export default function LanguagePriorityScreen() {
  const { theme } = useTheme();
  const [order, setOrder] = useState<LanguageId[]>(DEFAULT_ORDER);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        const parsed = safeJsonParse(raw, isLanguageOrder);
        if (parsed) setOrder(parsed);
      })
      .catch(() => {});
  }, []);

  const persist = async (next: LanguageId[]) => {
    setOrder(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
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
