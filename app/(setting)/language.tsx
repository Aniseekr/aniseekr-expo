// Unified Language settings — App chrome + anime-data language together.
//
// Why one screen with two sections: users think of "language" as one concept.
// Splitting App vs Title vs Vocab into 3 screens forces them to hunt. The
// underlying storage stays split (each MMKV key owned by its own module) so
// downstream consumers can subscribe to just the one they need.

import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { SettingsScreenLayout } from '../../components/setting/SettingsScreenLayout';
import { safeJsonParse } from '../../libs/utils/safe-json';
import {
  LANGUAGE_IDS,
  useI18n,
  type AppLanguagePreference,
  type LanguageId,
  type TranslationKey,
} from '../../libs/i18n';
import {
  getAutotranslateSync,
  getShowOriginalSync,
  getVocabLanguageSync,
  setAutotranslate,
  setShowOriginal,
  setVocabLanguage,
} from '../../libs/i18n/data-language-prefs';
import { kvGet, kvSet } from '../../libs/services/storage/app-storage';
import { LANGUAGE_PRIORITY_KEY } from '../../libs/services/storage/keys';

// --- title-priority types (kept identical to old language-priority.tsx) ---

type TitleLangId = 'english' | 'romaji' | 'japanese' | 'chinese';

const TITLE_FLAGS: Record<TitleLangId, string> = {
  english: '🇬🇧',
  romaji: 'A',
  japanese: '🇯🇵',
  chinese: '🇹🇼',
};

const TITLE_NAME_KEY: Record<TitleLangId, TranslationKey> = {
  english: 'titleLanguage.english',
  romaji: 'titleLanguage.romaji',
  japanese: 'titleLanguage.japanese',
  chinese: 'titleLanguage.chinese',
};

const DEFAULT_ORDER: TitleLangId[] = ['english', 'romaji', 'japanese', 'chinese'];

const isTitleOrder = (value: unknown): value is TitleLangId[] =>
  Array.isArray(value) &&
  value.every((id): id is TitleLangId => typeof id === 'string' && id in TITLE_FLAGS);

function readOrderSync(): TitleLangId[] {
  return safeJsonParse(kvGet(LANGUAGE_PRIORITY_KEY), isTitleOrder) ?? DEFAULT_ORDER;
}

// --- screen ---

export default function LanguageScreen() {
  const { theme } = useTheme();
  const { preference, setPreference, languages, t } = useI18n();

  // Anime data prefs — each owned by its own MMKV key, mirrored in local state.
  const [titleOrder, setTitleOrder] = useState<TitleLangId[]>(readOrderSync);
  const [vocabLang, setVocabLangState] = useState<AppLanguagePreference>(getVocabLanguageSync);
  const [autotranslate, setAutotranslateState] = useState<boolean>(getAutotranslateSync);
  const [showOriginal, setShowOriginalState] = useState<boolean>(getShowOriginalSync);

  const appOptions: { id: AppLanguagePreference; label: string; subtitle?: string; flag: string }[] = [
    { id: 'auto', label: t('language.systemDefault'), flag: '🌐' },
    ...LANGUAGE_IDS.map<{
      id: AppLanguagePreference;
      label: string;
      subtitle?: string;
      flag: string;
    }>((id: LanguageId) => ({
      id,
      label: languages[id].nativeName,
      subtitle: languages[id].englishName,
      flag: languages[id].flag,
    })),
  ];

  const pickAppLang = (id: AppLanguagePreference) => {
    if (id === preference) return;
    hapticsBridge.selection();
    setPreference(id);
  };

  const moveTitle = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= titleOrder.length) return;
    const next = [...titleOrder];
    [next[index], next[target]] = [next[target], next[index]];
    hapticsBridge.selection();
    setTitleOrder(next);
    kvSet(LANGUAGE_PRIORITY_KEY, JSON.stringify(next));
  };

  const resetTitle = () => {
    hapticsBridge.warning();
    setTitleOrder(DEFAULT_ORDER);
    kvSet(LANGUAGE_PRIORITY_KEY, JSON.stringify(DEFAULT_ORDER));
  };

  const pickVocab = (id: AppLanguagePreference) => {
    if (id === vocabLang) return;
    hapticsBridge.selection();
    setVocabLangState(id);
    setVocabLanguage(id);
  };

  const toggleAutotranslate = (value: boolean) => {
    hapticsBridge.selection();
    setAutotranslateState(value);
    setAutotranslate(value);
  };

  const toggleShowOriginal = (value: boolean) => {
    hapticsBridge.selection();
    setShowOriginalState(value);
    setShowOriginal(value);
  };

  return (
    <SettingsScreenLayout
      title={t('language.screenTitle')}
      subtitle={t('language.screenSubtitle')}>
      {/* SECTION 1 — App language */}
      <SectionHeader label={t('language.section.app')} color={theme.text.tertiary} />
      <Card theme={theme}>
        {appOptions.map((option, idx) => {
          const selected = option.id === preference;
          const last = idx === appOptions.length - 1;
          return (
            <Pressable
              key={option.id}
              onPress={() => pickAppLang(option.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.row,
                !last && {
                  borderBottomColor: theme.glassBorder,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                },
                pressed && { opacity: 0.7 },
              ]}>
              <Text style={styles.flag}>{option.flag}</Text>
              <View style={styles.rowLabel}>
                <Text style={[Typography.bodyMedium, { color: theme.text.primary }]}>
                  {option.label}
                </Text>
                {option.subtitle ? (
                  <Text style={[Typography.caption, { color: theme.text.tertiary }]}>
                    {option.subtitle}
                  </Text>
                ) : null}
              </View>
              {selected ? (
                <MaterialIcons name="check-circle" size={22} color={theme.accent} />
              ) : (
                <View style={styles.checkPlaceholder} />
              )}
            </Pressable>
          );
        })}
      </Card>

      {/* SECTION 2 — Anime data language */}
      <SectionHeader
        label={t('language.section.data')}
        color={theme.text.tertiary}
        style={{ marginTop: Spacing.xl }}
      />

      {/* 2a — Title priority */}
      <RowLabel
        title={t('language.titlePriority')}
        subtitle={t('language.titlePriorityDesc')}
        color={theme.text.secondary}
        action={
          <Pressable
            onPress={resetTitle}
            hitSlop={12}
            accessibilityLabel={t('titleLanguage.resetA11y')}>
            <MaterialIcons name="restore" size={20} color={theme.text.secondary} />
          </Pressable>
        }
      />
      <Card theme={theme}>
        {titleOrder.map((id, idx) => {
          const last = idx === titleOrder.length - 1;
          return (
            <View
              key={id}
              style={[
                styles.row,
                !last && {
                  borderBottomColor: theme.glassBorder,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                },
              ]}>
              <View style={[styles.priorityBadge, { backgroundColor: theme.accent + '24' }]}>
                <Text style={[styles.priorityText, { color: theme.accent }]}>{idx + 1}</Text>
              </View>
              <Text style={styles.flag}>{TITLE_FLAGS[id]}</Text>
              <Text style={[Typography.bodyMedium, { color: theme.text.primary, flex: 1 }]}>
                {t(TITLE_NAME_KEY[id])}
              </Text>
              <View style={styles.arrowGroup}>
                <Pressable
                  onPress={() => moveTitle(idx, -1)}
                  disabled={idx === 0}
                  hitSlop={8}
                  style={[styles.arrowButton, idx === 0 && { opacity: 0.3 }]}>
                  <MaterialIcons name="keyboard-arrow-up" size={22} color={theme.text.primary} />
                </Pressable>
                <Pressable
                  onPress={() => moveTitle(idx, 1)}
                  disabled={idx === titleOrder.length - 1}
                  hitSlop={8}
                  style={[
                    styles.arrowButton,
                    idx === titleOrder.length - 1 && { opacity: 0.3 },
                  ]}>
                  <MaterialIcons
                    name="keyboard-arrow-down"
                    size={22}
                    color={theme.text.primary}
                  />
                </Pressable>
              </View>
            </View>
          );
        })}
      </Card>

      {/* 2b — Genre / tag vocab language */}
      <RowLabel
        title={t('language.vocabLanguage')}
        subtitle={t('language.vocabLanguageDesc')}
        color={theme.text.secondary}
        style={{ marginTop: Spacing.lg }}
      />
      <Card theme={theme}>
        {([
          { id: 'auto', label: t('language.vocabAuto'), flag: '🌐' },
          ...LANGUAGE_IDS.map((id) => ({
            id: id as AppLanguagePreference,
            label: languages[id].nativeName,
            flag: languages[id].flag,
          })),
        ] as { id: AppLanguagePreference; label: string; flag: string }[]).map((option, idx, arr) => {
          const selected = option.id === vocabLang;
          const last = idx === arr.length - 1;
          return (
            <Pressable
              key={option.id}
              onPress={() => pickVocab(option.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.row,
                !last && {
                  borderBottomColor: theme.glassBorder,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                },
                pressed && { opacity: 0.7 },
              ]}>
              <Text style={styles.flag}>{option.flag}</Text>
              <Text style={[Typography.bodyMedium, { color: theme.text.primary, flex: 1 }]}>
                {option.label}
              </Text>
              {selected ? (
                <MaterialIcons name="check-circle" size={22} color={theme.accent} />
              ) : (
                <View style={styles.checkPlaceholder} />
              )}
            </Pressable>
          );
        })}
      </Card>

      {/* 2c — Auto-translate synopsis (disabled until P3 ships MT) */}
      <Card theme={theme} style={{ marginTop: Spacing.lg }}>
        <ToggleRow
          theme={theme}
          title={t('language.autotranslateSynopsis')}
          subtitle={`${t('language.autotranslateSynopsisDesc')} · ${t('common.comingSoon')}`}
          value={autotranslate}
          onValueChange={toggleAutotranslate}
          disabled
        />
        <Divider color={theme.glassBorder} />
        <ToggleRow
          theme={theme}
          title={t('language.showOriginal')}
          subtitle={t('language.showOriginalDesc')}
          value={showOriginal}
          onValueChange={toggleShowOriginal}
        />
      </Card>

      <View style={styles.helpBlock}>
        <Text
          style={[
            Typography.titleSmall,
            { color: theme.text.primary, marginBottom: Spacing.xs },
          ]}>
          {t('language.helpTranslateTitle')}
        </Text>
        <Text style={[Typography.caption, { color: theme.text.secondary }]}>
          {t('language.helpTranslateBody')}
        </Text>
      </View>
    </SettingsScreenLayout>
  );
}

// --- small layout helpers (kept local — too thin to deserve their own file) ---

function SectionHeader({
  label,
  color,
  style,
}: {
  label: string;
  color: string;
  style?: object;
}) {
  return (
    <Text
      style={[
        Typography.captionSmall,
        {
          color,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          paddingHorizontal: 4,
          marginBottom: Spacing.sm,
        },
        style,
      ]}>
      {label}
    </Text>
  );
}

function RowLabel({
  title,
  subtitle,
  color,
  action,
  style,
}: {
  title: string;
  subtitle?: string;
  color: string;
  action?: React.ReactNode;
  style?: object;
}) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 4,
          marginBottom: Spacing.xs,
        },
        style,
      ]}>
      <View style={{ flex: 1 }}>
        <Text style={[Typography.bodyMedium, { color }]}>{title}</Text>
        {subtitle ? (
          <Text style={[Typography.caption, { color, opacity: 0.7 }]}>{subtitle}</Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

function Card({
  children,
  theme,
  style,
}: {
  children: React.ReactNode;
  theme: ReturnType<typeof useTheme>['theme'];
  style?: object;
}) {
  return (
    <View
      style={[
        styles.list,
        {
          backgroundColor: theme.background.secondary,
          borderColor: theme.glassBorder,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

function ToggleRow({
  theme,
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
}: {
  theme: ReturnType<typeof useTheme>['theme'];
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View
      style={[
        styles.row,
        { opacity: disabled ? 0.55 : 1 },
      ]}>
      <View style={{ flex: 1 }}>
        <Text style={[Typography.bodyMedium, { color: theme.text.primary }]}>{title}</Text>
        {subtitle ? (
          <Text style={[Typography.caption, { color: theme.text.tertiary, marginTop: 2 }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: theme.accent, false: 'rgba(255,255,255,0.2)' }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

function Divider({ color }: { color: string }) {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: color }} />;
}

const styles = StyleSheet.create({
  list: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  rowLabel: {
    flex: 1,
  },
  flag: {
    fontSize: 22,
  },
  checkPlaceholder: {
    width: 22,
    height: 22,
  },
  priorityBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityText: {
    ...Typography.titleSmall,
    fontWeight: '800',
  },
  arrowGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  arrowButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  helpBlock: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
});
