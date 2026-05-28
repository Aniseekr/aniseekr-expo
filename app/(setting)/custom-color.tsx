import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Stack, useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { normalizeHex, useTheme, type ThemePalette } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { ThemedButton, ThemedText, readableTextOn } from '../../components/themed';
import { useT } from '../../libs/i18n';

const HUE_STOPS: [string, string, ...string[]] = [
  '#FF0000',
  '#FFFF00',
  '#00FF00',
  '#00FFFF',
  '#0000FF',
  '#FF00FF',
  '#FF0000',
];

interface HSL {
  h: number;
  s: number;
  l: number;
}
interface RGB {
  r: number;
  g: number;
  b: number;
}

function hslToRgb({ h, s, l }: HSL): RGB {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

function rgbToHex({ r, g, b }: RGB): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function hexToRgb(hex: string): RGB | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export default function CustomColorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { theme, customAccent, setCustomAccent, recentAccents } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const initialHex = customAccent ?? theme.accent.toUpperCase();
  const initialRgb = hexToRgb(initialHex) ?? { r: 255, g: 153, b: 0 };
  const initialHsl = rgbToHsl(initialRgb);

  const [hsl, setHsl] = useState<HSL>(initialHsl);

  const rgb = useMemo(() => hslToRgb(hsl), [hsl]);
  const hex = useMemo(() => rgbToHex(rgb), [rgb]);

  const apply = useCallback(async () => {
    hapticsBridge.success();
    await setCustomAccent(hex);
    router.back();
  }, [hex, router, setCustomAccent]);

  const setHexInput = (raw: string) => {
    const norm = normalizeHex(raw);
    if (!norm) return;
    const next = hexToRgb(norm);
    if (next) setHsl(rgbToHsl(next));
  };

  const setRgbChannel = (channel: 'r' | 'g' | 'b', raw: string) => {
    const v = Math.max(0, Math.min(255, parseInt(raw || '0', 10)));
    if (Number.isNaN(v)) return;
    const next = { ...rgb, [channel]: v };
    setHsl(rgbToHsl(next));
  };

  const setHslChannel = (channel: keyof HSL, raw: string) => {
    const max = channel === 'h' ? 360 : 100;
    const v = Math.max(0, Math.min(max, parseInt(raw || '0', 10)));
    if (Number.isNaN(v)) return;
    setHsl((prev) => ({ ...prev, [channel]: v }));
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.navBar}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.navBack, pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text.primary} />
          </Pressable>
          <ThemedText variant="titleLarge" weight="600">
            {t('settings.customColor.title')}
          </ThemedText>
          <Pressable
            onPress={apply}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('settings.customColor.saveA11y')}
            style={({ pressed }) => [styles.navSave, pressed && { opacity: 0.6 }]}>
            <ThemedText variant="bodyMedium" weight="600" style={{ color: hex }}>
              {t('common.save')}
            </ThemedText>
          </Pressable>
        </View>

        <KeyboardAwareScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          bottomOffset={20}
          keyboardShouldPersistTaps="handled">
          <View style={styles.previewWrap}>
            <View style={[styles.previewRing, { borderColor: hex }]}>
              <View style={[styles.previewInner, { backgroundColor: hex }]}>
                <ThemedText
                  variant="titleLarge"
                  weight="700"
                  style={{ color: readableTextOn(hex), letterSpacing: 1 }}>
                  {hex}
                </ThemedText>
              </View>
            </View>
          </View>

          <SliderRow
            label={t('settings.customColor.hue')}
            value={hsl.h}
            suffix="°"
            min={0}
            max={360}
            accent={hex}
            track={
              <LinearGradient
                colors={HUE_STOPS}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.trackGradient}
              />
            }
            onChange={(v) => setHsl({ ...hsl, h: Math.round(v) })}
          />
          <SliderRow
            label={t('settings.customColor.saturation')}
            value={hsl.s}
            suffix="%"
            min={0}
            max={100}
            accent={hex}
            track={
              <LinearGradient
                colors={[
                  rgbToHex(hslToRgb({ ...hsl, s: 0 })),
                  rgbToHex(hslToRgb({ ...hsl, s: 100 })),
                ]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.trackGradient}
              />
            }
            onChange={(v) => setHsl({ ...hsl, s: Math.round(v) })}
          />
          <SliderRow
            label={t('settings.customColor.lightness')}
            value={hsl.l}
            suffix="%"
            min={0}
            max={100}
            accent={hex}
            track={
              <LinearGradient
                colors={['#000000', rgbToHex(hslToRgb({ ...hsl, l: 50 })), '#FFFFFF']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.trackGradient}
              />
            }
            onChange={(v) => setHsl({ ...hsl, l: Math.round(v) })}
          />

          <ThemedText
            variant="captionSmall"
            tone="secondary"
            weight="600"
            style={styles.sectionHeader}>
            {t('settings.customColor.section.values')}
          </ThemedText>
          <View style={styles.valuesCard}>
            <View style={styles.valueRow}>
              <ThemedText variant="bodySmall" tone="secondary" weight="500">
                HEX
              </ThemedText>
              <TextInput
                value={hex}
                onChangeText={setHexInput}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={7}
                selectTextOnFocus
                style={[styles.hexValue, { color: theme.text.primary }]}
              />
            </View>
            <View style={styles.valueSep} />
            <View style={styles.valueRow}>
              <ThemedText variant="bodySmall" tone="secondary" weight="500">
                RGB
              </ThemedText>
              <View style={styles.valueInputs}>
                {(['r', 'g', 'b'] as const).map((c) => (
                  <View key={c} style={styles.inputBox}>
                    <TextInput
                      keyboardType="number-pad"
                      value={String(rgb[c])}
                      onChangeText={(v) => setRgbChannel(c, v)}
                      style={[styles.inputText, { color: theme.text.primary }]}
                      maxLength={3}
                      selectTextOnFocus
                    />
                  </View>
                ))}
              </View>
            </View>
            <View style={styles.valueSep} />
            <View style={styles.valueRow}>
              <ThemedText variant="bodySmall" tone="secondary" weight="500">
                HSL
              </ThemedText>
              <View style={styles.valueInputs}>
                {(['h', 's', 'l'] as const).map((c) => (
                  <View key={c} style={styles.inputBox}>
                    <TextInput
                      keyboardType="number-pad"
                      value={String(hsl[c])}
                      onChangeText={(v) => setHslChannel(c, v)}
                      style={[styles.inputText, { color: theme.text.primary }]}
                      maxLength={3}
                      selectTextOnFocus
                    />
                  </View>
                ))}
              </View>
            </View>
          </View>

          <ThemedText
            variant="captionSmall"
            tone="secondary"
            weight="600"
            style={styles.sectionHeader}>
            {t('settings.customColor.section.recent')}
          </ThemedText>
          <View style={styles.recentRow}>
            {recentAccents.length === 0 ? (
              <ThemedText variant="bodySmall" tone="tertiary">
                {t('settings.customColor.recentEmpty')}
              </ThemedText>
            ) : (
              recentAccents.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => {
                    hapticsBridge.selection();
                    const next = hexToRgb(c);
                    if (next) setHsl(rgbToHsl(next));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${c}`}
                  style={({ pressed }) => [
                    styles.recentDot,
                    {
                      backgroundColor: c,
                      borderColor: c.toUpperCase() === hex ? theme.text.primary : theme.glassBorder,
                      borderWidth: c.toUpperCase() === hex ? 2 : 1,
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                />
              ))
            )}
          </View>

          <ThemedButton
            label={t('settings.customColor.applyCta')}
            onPress={apply}
            accent={hex}
            size="lg"
            fullWidth
            haptic="success"
            icon={<Ionicons name="checkmark" size={18} color={readableTextOn(hex)} />}
          />
        </KeyboardAwareScrollView>
      </SafeAreaView>
    </View>
  );
}

function SliderRow({
  label,
  value,
  suffix,
  min,
  max,
  accent,
  track,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  accent: string;
  track: React.ReactNode;
  onChange: (v: number) => void;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.sliderRow}>
      <View style={styles.sliderHeader}>
        <ThemedText variant="captionSmall" tone="secondary" weight="500">
          {label}
        </ThemedText>
        <ThemedText variant="captionSmall" weight="600">
          {value}
          {suffix}
        </ThemedText>
      </View>
      <View style={styles.sliderTrackWrap}>
        <View style={styles.sliderTrackBg}>{track}</View>
        <Slider
          minimumValue={min}
          maximumValue={max}
          value={value}
          onValueChange={onChange}
          minimumTrackTintColor="transparent"
          maximumTrackTintColor="transparent"
          thumbTintColor={accent}
          style={styles.sliderControl}
        />
      </View>
    </View>
  );
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background.primary },
    navBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      height: 52,
    },
    navBack: { minWidth: 60 },
    navSave: { minWidth: 60, alignItems: 'flex-end' },
    scroll: { paddingHorizontal: 20, paddingBottom: 24, gap: 18 },
    previewWrap: { alignItems: 'center', paddingVertical: 12 },
    previewRing: {
      width: 220,
      height: 220,
      borderRadius: 110,
      borderWidth: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    previewInner: {
      width: 180,
      height: 180,
      borderRadius: 90,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sliderRow: { gap: 6 },
    sliderHeader: { flexDirection: 'row', justifyContent: 'space-between' },
    sliderTrackWrap: { height: 28, justifyContent: 'center' },
    sliderTrackBg: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 6,
      borderRadius: 3,
      overflow: 'hidden',
    },
    trackGradient: { flex: 1 },
    sliderControl: { width: '100%', height: 28 },
    sectionHeader: {
      letterSpacing: 1.2,
      marginTop: 4,
    },
    valuesCard: {
      backgroundColor: theme.background.secondary,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      paddingHorizontal: 14,
    },
    valueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      minHeight: 54,
    },
    hexValue: {
      fontSize: 15,
      fontWeight: '600',
      minWidth: 120,
      textAlign: 'right',
    },
    valueInputs: { flexDirection: 'row', gap: 8 },
    inputBox: {
      width: 54,
      height: 38,
      backgroundColor: theme.background.tertiary,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inputText: {
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
      paddingVertical: 0,
      width: '100%',
    },
    valueSep: { height: 1, backgroundColor: theme.glassBorder },
    recentRow: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
    recentDot: {
      width: 44,
      height: 44,
      borderRadius: 22,
    },
  });
}
