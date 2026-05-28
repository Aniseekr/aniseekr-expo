import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Spacing } from '../../constants/DesignSystem';
import { FeatureFlags } from '../../constants/FeatureFlags';
import {
  ACCENT_GRADIENTS,
  ACCENT_PRESETS,
  type AccentGradient,
  type AccentPreset,
  type ThemeId,
  type ThemeMode,
  type ThemePalette,
  type TintIntensity,
  useTheme,
} from '../../context/ThemeContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { ThemedButton, ThemedText, readableTextOn } from '../../components/themed';
import { PaywallSheet } from '../../components/subscription/PaywallSheet';
import { useT } from '../../libs/i18n';
import {
  loadUserPrefsSync,
  patchUserPrefs,
  type UserPrefs,
} from '../../libs/services/user-prefs';
import { useMapThemePref } from '../../hooks/useMapThemePref';
import type { MapThemePref } from '../../libs/services/pilgrimage/map-theme-prefs';

const MODE_DEFS: { id: ThemeMode; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { id: 'light', icon: 'sunny-outline' },
  { id: 'dark', icon: 'moon-outline' },
  { id: 'auto', icon: 'contrast-outline' },
];

const MAP_MODE_DEFS: { id: MapThemePref; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { id: 'light', icon: 'map-outline' },
  { id: 'dark', icon: 'moon-outline' },
  { id: 'auto', icon: 'contrast-outline' },
];

const TINT_STEPS: TintIntensity[] = ['subtle', 'balanced', 'vivid'];

export default function AppearanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const subscription = useSubscription();
  const t = useT();
  const MODES = MODE_DEFS.map((m) => ({ ...m, label: t(`settings.appearance.mode.${m.id}`) }));
  const MAP_MODES = MAP_MODE_DEFS.map((m) => ({ ...m, label: t(`settings.appearance.mode.${m.id}`) }));
  const {
    theme,
    themeId,
    themes,
    setTheme,
    themeMode,
    setThemeMode,
    customAccent,
    setCustomAccent,
    recentAccents,
    tintIntensity,
    setTintIntensity,
    increaseContrast,
    setIncreaseContrast,
  } = useTheme();

  const [bootstrapPrefs] = useState(loadUserPrefsSync);
  const [prefs, setPrefs] = useState<UserPrefs>(bootstrapPrefs);
  const [cardHeight, setCardHeight] = useState<number>(bootstrapPrefs.cardHeightPercent);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const { pref: mapThemePref, setPref: setMapThemePref } = useMapThemePref();

  const styles = useMemo(() => makeStyles(theme), [theme]);
  const accent = theme.accent;
  const accentFg = readableTextOn(accent);
  const activeAccentHex = (customAccent ?? theme.accent).toUpperCase();
  const tintIndex = TINT_STEPS.indexOf(tintIntensity);
  const isPro = subscription.isPro;

  // Prefs are seeded synchronously above; no async load required.

  const handleThemePress = (palette: ThemePalette) => {
    if (palette.id === themeId && !customAccent) return;
    if (palette.isPremium && !isPro) {
      hapticsBridge.warning();
      setPaywallVisible(true);
      return;
    }
    hapticsBridge.success();
    void setTheme(palette.id);
  };

  const handleAccentPress = (hex: string) => {
    hapticsBridge.selection();
    void setCustomAccent(hex);
  };

  const handleResetAccent = () => {
    hapticsBridge.warning();
    void setCustomAccent(null);
  };

  const handleCardHeightCommit = async (value: number) => {
    const rounded = Math.round(value / 5) * 5;
    if (rounded === prefs.cardHeightPercent) return;
    hapticsBridge.selection();
    const next = await patchUserPrefs({ cardHeightPercent: rounded });
    setPrefs(next);
    setCardHeight(next.cardHeightPercent);
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={theme.gradient} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.navBar}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back to settings"
            style={({ pressed }) => [styles.navBack, pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text.primary} />
            <ThemedText variant="bodyMedium" weight="500">
              {t('settings.title')}
            </ThemedText>
          </Pressable>
          <ThemedText variant="titleLarge" weight="600">
            {t('settings.appearance.title')}
          </ThemedText>
          <View style={{ width: 80 }} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}>
          <PreviewCard
            accent={accent}
            accentFg={accentFg}
            gradient={theme.gradient}
            text={theme.text}
          />

          <SectionHeader>{t('settings.appearance.section.theme')}</SectionHeader>
          <View style={styles.themeGrid}>
            {themes.map((palette) => (
              <ThemeCard
                key={palette.id}
                palette={palette}
                isSelected={palette.id === themeId}
                isLocked={!!palette.isPremium && !isPro}
                onPress={() => handleThemePress(palette)}
              />
            ))}
          </View>

          <SectionHeader>{t('settings.appearance.section.mode')}</SectionHeader>
          <View style={styles.modeRow}>
            {MODES.map((m) => (
              <ModeChip
                key={m.id}
                mode={m}
                selected={themeMode === m.id}
                onPress={() => {
                  hapticsBridge.selection();
                  void setThemeMode(m.id);
                }}
              />
            ))}
          </View>

          <SectionHeader>{t('settings.appearance.section.map')}</SectionHeader>
          <ThemedText
            variant="captionSmall"
            tone="tertiary"
            style={{ marginTop: -8 }}>
            {t('settings.appearance.mapHint')}
          </ThemedText>
          <View style={styles.modeRow}>
            {MAP_MODES.map((m) => (
              <ModeChip
                key={m.id}
                mode={m}
                selected={mapThemePref === m.id}
                onPress={() => {
                  hapticsBridge.selection();
                  void setMapThemePref(m.id);
                }}
              />
            ))}
          </View>

          <SectionHeader>{t('settings.appearance.section.accent')}</SectionHeader>
          <View style={styles.presetGrid}>
            {ACCENT_PRESETS.map((p) => (
              <AccentSwatch
                key={p.hex}
                preset={p}
                selected={activeAccentHex === p.hex.toUpperCase()}
                onPress={() => handleAccentPress(p.hex)}
              />
            ))}
          </View>
          <View style={styles.gradientList}>
            {ACCENT_GRADIENTS.map((g) => (
              <GradientCard
                key={g.id}
                gradient={g}
                selected={activeAccentHex === g.colors[0].toUpperCase()}
                onPress={() => handleAccentPress(g.colors[0])}
              />
            ))}
          </View>
          {recentAccents.length > 0 ? (
            <View style={styles.recentRow}>
              <ThemedText variant="captionSmall" tone="secondary" weight="600">
                {t('settings.appearance.section.recent')}
              </ThemedText>
              <View style={styles.recentDots}>
                {recentAccents.map((hex) => (
                  <Pressable
                    key={hex}
                    onPress={() => handleAccentPress(hex)}
                    accessibilityRole="button"
                    accessibilityLabel={`Use recent ${hex}`}
                    style={({ pressed }) => [
                      styles.recentDot,
                      {
                        backgroundColor: hex,
                        borderColor:
                          activeAccentHex === hex.toUpperCase()
                            ? theme.text.primary
                            : theme.glassBorder,
                        borderWidth: activeAccentHex === hex.toUpperCase() ? 2 : 1,
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                  />
                ))}
              </View>
            </View>
          ) : null}
          <View style={styles.accentActions}>
            <ThemedButton
              variant="secondary"
              label={t('settings.appearance.customHex')}
              icon={
                <Ionicons name="color-wand-outline" size={16} color={theme.text.primary} />
              }
              onPress={() => router.push('/(setting)/custom-color')}
              fullWidth
            />
            {customAccent ? (
              <ThemedButton
                variant="ghost"
                label={t('settings.appearance.resetToDefault')}
                icon={
                  <Ionicons name="refresh-outline" size={16} color={theme.text.secondary} />
                }
                onPress={handleResetAccent}
                fullWidth
              />
            ) : null}
          </View>

          <SectionHeader>{t('settings.appearance.section.density')}</SectionHeader>
          <View style={styles.sliderCard}>
            <View style={styles.sliderHeader}>
              <View style={{ flex: 1 }}>
                <ThemedText variant="titleMedium" weight="600">
                  {t('settings.appearance.cardHeight')}
                </ThemedText>
                <ThemedText variant="bodySmall" tone="secondary">
                  {t('settings.appearance.cardHeightDesc')}
                </ThemedText>
              </View>
              <ThemedText variant="titleMedium" weight="700">
                {Math.round(cardHeight)}%
              </ThemedText>
            </View>
            <Slider
              minimumValue={70}
              maximumValue={100}
              step={5}
              value={cardHeight}
              onValueChange={setCardHeight}
              onSlidingComplete={handleCardHeightCommit}
              minimumTrackTintColor={accent}
              maximumTrackTintColor={theme.glassBorder}
              thumbTintColor={theme.text.primary}
              style={styles.slider}
            />
          </View>

          <SectionHeader>{t('settings.appearance.section.advanced')}</SectionHeader>
          <View style={styles.sliderCard}>
            <View style={styles.sliderHeader}>
              <View style={{ flex: 1 }}>
                <ThemedText variant="titleMedium" weight="600">
                  {t('settings.appearance.tintIntensity')}
                </ThemedText>
                <ThemedText variant="bodySmall" tone="secondary">
                  {tintSubtitle(tintIntensity, t)}
                </ThemedText>
              </View>
              <View
                style={[
                  styles.sampleChip,
                  { backgroundColor: accent + '22', borderColor: accent },
                ]}>
                <View style={[styles.sampleDot, { backgroundColor: accent }]} />
                <ThemedText variant="bodySmall" weight="600" style={{ color: accent }}>
                  {t('settings.appearance.sample')}
                </ThemedText>
              </View>
            </View>
            <Slider
              minimumValue={0}
              maximumValue={2}
              step={1}
              value={tintIndex}
              onValueChange={(v) => {
                const next = TINT_STEPS[Math.round(v)] ?? 'balanced';
                if (next !== tintIntensity) {
                  hapticsBridge.selection();
                  void setTintIntensity(next);
                }
              }}
              minimumTrackTintColor={accent}
              maximumTrackTintColor={theme.glassBorder}
              thumbTintColor={theme.text.primary}
              style={styles.slider}
            />
            <View style={styles.marksRow}>
              {TINT_STEPS.map((s) => (
                <ThemedText
                  key={s}
                  variant="captionSmall"
                  tone={s === tintIntensity ? 'accent' : 'tertiary'}
                  weight={s === tintIntensity ? '600' : '500'}>
                  {t(`settings.appearance.tint.${s}`)}
                </ThemedText>
              ))}
            </View>
          </View>
          <View style={styles.toggleCard}>
            <View style={{ flex: 1 }}>
              <ThemedText variant="titleMedium" weight="600">
                {t('settings.appearance.increaseContrast')}
              </ThemedText>
              <ThemedText variant="bodySmall" tone="secondary">
                {t('settings.appearance.increaseContrastDesc')}
              </ThemedText>
            </View>
            <Switch
              value={increaseContrast}
              onValueChange={(v) => {
                hapticsBridge.selection();
                void setIncreaseContrast(v);
              }}
              trackColor={{ false: theme.background.tertiary, true: accent }}
              thumbColor={theme.text.primary}
            />
          </View>

          <Pressable
            onPress={() => router.push('/(setting)/theme-preview')}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Open live preview"
            style={({ pressed }) => [styles.previewLink, pressed && { opacity: 0.6 }]}>
            <Ionicons name="eye-outline" size={14} color={theme.text.tertiary} />
            <ThemedText variant="captionSmall" tone="tertiary" weight="500">
              {t('settings.appearance.seeLivePreview')}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      <PaywallSheet visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </View>
  );
}

function SectionHeader({ children }: { children: string }) {
  return (
    <ThemedText
      variant="captionSmall"
      tone="tertiary"
      weight="600"
      style={styles.sectionHeader}>
      {children}
    </ThemedText>
  );
}

function PreviewCard({
  accent,
  accentFg,
  gradient,
  text,
}: {
  accent: string;
  accentFg: string;
  gradient: ThemePalette['gradient'];
  text: ThemePalette['text'];
}) {
  const t = useT();
  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.previewCard}>
      <View style={[styles.previewBubble, { backgroundColor: accent }]}>
        <Ionicons name="sparkles" size={20} color={accentFg} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText variant="titleMedium" weight="700" style={{ color: text.primary }}>
          {t('settings.appearance.livePreview')}
        </ThemedText>
        <ThemedText variant="bodySmall" style={{ color: text.secondary }}>
          {t('settings.appearance.livePreviewDesc')}
        </ThemedText>
      </View>
      <View style={[styles.previewChip, { backgroundColor: accent }]}>
        <ThemedText variant="captionSmall" weight="700" style={{ color: accentFg }}>
          A
        </ThemedText>
      </View>
    </LinearGradient>
  );
}

function ThemeCard({
  palette,
  isSelected,
  isLocked,
  onPress,
}: {
  palette: ThemePalette;
  isSelected: boolean;
  isLocked: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${palette.name} theme${isLocked ? ' (Premium)' : ''}`}
      accessibilityState={{ selected: isSelected }}
      style={({ pressed }) => [
        styles.themeCard,
        {
          borderColor: isSelected ? palette.accent : theme.glassBorder,
          borderWidth: isSelected ? 2 : 1,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <LinearGradient
        colors={palette.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.themeCardFill}>
        <View style={styles.themeSwatchRow}>
          <View style={[styles.themeSwatch, { backgroundColor: palette.accent }]} />
          <View style={[styles.themeSwatch, { backgroundColor: palette.accentLight }]} />
          <View style={[styles.themeSwatch, { backgroundColor: palette.secondary }]} />
        </View>
        <View style={{ flex: 1 }} />
        <View style={styles.themeFooter}>
          <ThemedText
            variant="titleSmall"
            weight="700"
            style={{ color: palette.text.primary }}>
            {palette.name}
          </ThemedText>
          {FeatureFlags.PREMIUM_ENABLED && palette.isPremium ? (
            <View
              style={[
                styles.premiumPill,
                { backgroundColor: palette.accent + '40' },
              ]}>
              <Ionicons
                name={isLocked ? 'lock-closed' : 'sparkles'}
                size={9}
                color={palette.accent}
              />
              <ThemedText
                variant="captionSmall"
                weight="700"
                style={{ color: palette.accent }}>
                {t('settings.appearance.premium')}
              </ThemedText>
            </View>
          ) : null}
          {isSelected ? (
            <MaterialIcons name="check-circle" size={18} color={palette.accent} />
          ) : null}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function ModeChip({
  mode,
  selected,
  onPress,
}: {
  mode: { id: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] };
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const accent = theme.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${mode.label} mode`}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.modeChip,
        {
          backgroundColor: selected ? accent + '22' : theme.background.secondary,
          borderColor: selected ? accent : theme.glassBorder,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <Ionicons
        name={mode.icon}
        size={18}
        color={selected ? accent : theme.text.secondary}
      />
      <ThemedText
        variant="bodySmall"
        weight={selected ? '700' : '500'}
        style={{ color: selected ? accent : theme.text.primary }}>
        {mode.label}
      </ThemedText>
    </Pressable>
  );
}

function AccentSwatch({
  preset,
  selected,
  onPress,
}: {
  preset: AccentPreset;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Select ${preset.name}`}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.accentSwatchWrap,
        pressed && { opacity: 0.85 },
      ]}>
      <View
        style={[
          styles.accentCircle,
          {
            backgroundColor: preset.hex,
            borderColor: selected ? preset.hex : 'transparent',
          },
        ]}>
        {selected ? (
          <View
            style={[
              styles.accentCheck,
              {
                backgroundColor: preset.hex,
                borderColor: theme.background.primary,
              },
            ]}>
            <Ionicons name="checkmark" size={12} color={readableTextOn(preset.hex)} />
          </View>
        ) : null}
      </View>
      <ThemedText
        variant="captionSmall"
        tone={selected ? 'primary' : 'secondary'}
        weight={selected ? '600' : '500'}>
        {preset.name}
      </ThemedText>
    </Pressable>
  );
}

function GradientCard({
  gradient,
  selected,
  onPress,
}: {
  gradient: AccentGradient;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Select ${gradient.name} gradient`}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.gradientCard,
        {
          borderColor: selected ? theme.text.primary : theme.glassBorder,
          borderWidth: selected ? 2 : 1,
        },
        pressed && { opacity: 0.9 },
      ]}>
      <LinearGradient
        colors={gradient.colors}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.gradientFill}>
        <View style={{ flex: 1 }}>
          <ThemedText
            variant="titleSmall"
            weight="700"
            style={{ color: readableTextOn(gradient.colors[0]) }}>
            {gradient.name}
          </ThemedText>
          <ThemedText
            variant="captionSmall"
            style={{ color: readableTextOn(gradient.colors[0]), opacity: 0.85 }}>
            {gradient.subtitle}
          </ThemedText>
        </View>
        {selected ? (
          <Ionicons
            name="checkmark-circle"
            size={20}
            color={readableTextOn(gradient.colors[1])}
          />
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}

function tintSubtitle(value: TintIntensity, t: (key: string, values?: Record<string, string | number>) => string) {
  switch (value) {
    case 'subtle':
      return t('settings.appearance.tintSubtitle.subtle');
    case 'vivid':
      return t('settings.appearance.tintSubtitle.vivid');
    default:
      return t('settings.appearance.tintSubtitle.balanced');
  }
}

// Module-level shared styles (no theme dependence). Used by subcomponents
// like ModeChip / AccentSwatch / GradientCard that don't receive `styles` as
// a prop — keep these keys pure-layout so they can live outside makeStyles.
const styles = StyleSheet.create({
  sectionHeader: { letterSpacing: 1.5, marginTop: Spacing.sm },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    padding: Spacing.md,
    borderRadius: 18,
  },
  previewBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeCard: {
    width: '48%',
    height: 130,
    borderRadius: 16,
    overflow: 'hidden',
  },
  themeCardFill: {
    flex: 1,
    padding: Spacing.sm + 2,
  },
  themeSwatchRow: { flexDirection: 'row', gap: 6 },
  themeSwatch: { width: 16, height: 16, borderRadius: 8 },
  themeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  premiumPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  modeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  accentSwatchWrap: {
    width: '22%',
    alignItems: 'center',
    gap: 4,
  },
  accentCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentCheck: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  gradientCard: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  gradientFill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 56,
  },
});

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background.primary },
    navBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      height: 48,
    },
    navBack: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 80 },
    scroll: { paddingHorizontal: 20, paddingTop: Spacing.xs, gap: 14 },
    themeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    modeRow: { flexDirection: 'row', gap: Spacing.sm },
    presetGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      rowGap: 16,
      columnGap: 12,
    },
    gradientList: { gap: 8 },
    recentRow: { gap: 6 },
    recentDots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    recentDot: {
      width: 36,
      height: 36,
      borderRadius: 18,
    },
    accentActions: { gap: Spacing.xs, marginTop: Spacing.xs },
    sliderCard: {
      backgroundColor: theme.background.secondary,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      padding: Spacing.md,
      gap: Spacing.sm,
    },
    sliderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    slider: { width: '100%', height: 28 },
    marksRow: { flexDirection: 'row', justifyContent: 'space-between' },
    toggleCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: theme.background.secondary,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      padding: Spacing.md,
    },
    sampleChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
    },
    sampleDot: { width: 8, height: 8, borderRadius: 4 },
    previewLink: {
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: Spacing.sm,
    },
  });
}
