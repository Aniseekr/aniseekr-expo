import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ACCENT_GRADIENTS,
  ACCENT_PRESETS,
  AccentGradient,
  AccentPreset,
  useTheme,
} from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

const BG_PRIMARY = '#0A0A0A';
const SURFACE_ELEVATED = '#252528';
const BORDER = '#2A2A2A';
const TEXT_PRIMARY = '#FFFFFF';
const TEXT_SECONDARY = '#8A8A8A';
const TEXT_MUTED = '#525252';
const SECTION_HEADER_COLOR = '#FF9900';

export default function AccentColorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, customAccent, setCustomAccent, recentAccents } = useTheme();
  const initial = customAccent ?? theme.accent.toUpperCase();
  const [pending, setPending] = useState<string>(initial);

  useEffect(() => {
    setPending(customAccent ?? theme.accent.toUpperCase());
  }, [customAccent, theme.accent]);

  const dirty = pending.toUpperCase() !== initial.toUpperCase();

  const handleSelect = (hex: string) => {
    hapticsBridge.selection();
    setPending(hex.toUpperCase());
  };

  const handleApply = async () => {
    hapticsBridge.success();
    await setCustomAccent(pending);
    router.back();
  };

  const handleReset = async () => {
    hapticsBridge.warning();
    await setCustomAccent(null);
    router.back();
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.navBar}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [styles.navBack, pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={22} color={TEXT_PRIMARY} />
            <Text style={styles.navBackText}>Settings</Text>
          </Pressable>
          <Text style={styles.navTitle}>Accent Color</Text>
          <Pressable
            onPress={handleReset}
            hitSlop={12}
            disabled={!customAccent}
            style={({ pressed }) => [
              styles.navReset,
              !customAccent && { opacity: 0.35 },
              pressed && customAccent ? { opacity: 0.6 } : null,
            ]}>
            <Text style={styles.navResetText}>Reset</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}>
          <Text style={styles.subtitle}>
            Choose an accent color used across buttons, tabs, and highlights throughout aniseekr.
          </Text>

          <Section title="PRESET ACCENTS">
            <View style={styles.presetGrid}>
              {ACCENT_PRESETS.map((preset) => (
                <PresetSwatch
                  key={preset.hex}
                  preset={preset}
                  selected={pending === preset.hex.toUpperCase()}
                  onPress={() => handleSelect(preset.hex)}
                />
              ))}
            </View>
          </Section>

          <Section title="GRADIENT ACCENTS">
            <View style={styles.gradientList}>
              {ACCENT_GRADIENTS.map((g) => (
                <GradientCard
                  key={g.id}
                  gradient={g}
                  selected={pending === g.colors[0].toUpperCase()}
                  onPress={() => handleSelect(g.colors[0])}
                />
              ))}
            </View>
          </Section>

          {(recentAccents.length > 0 || true) && (
            <Section title="RECENT">
              <View style={styles.recentRow}>
                {recentAccents.map((hex) => (
                  <Pressable
                    key={hex}
                    onPress={() => handleSelect(hex)}
                    style={({ pressed }) => [
                      styles.recentDot,
                      { backgroundColor: hex },
                      pending === hex && styles.recentDotSelected,
                      pressed && { opacity: 0.7 },
                    ]}
                  />
                ))}
                <Pressable
                  onPress={() => router.push('/(setting)/custom-color')}
                  style={({ pressed }) => [
                    styles.addCustom,
                    pressed && { opacity: 0.7 },
                  ]}>
                  <Ionicons name="add" size={18} color={TEXT_SECONDARY} />
                </Pressable>
              </View>
            </Section>
          )}
        </ScrollView>

        <View style={[styles.applyBar, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          <Pressable
            disabled={!dirty}
            onPress={handleApply}
            style={({ pressed }) => [
              styles.applyButton,
              { backgroundColor: pending },
              !dirty && { opacity: 0.5 },
              pressed && dirty ? { opacity: 0.85 } : null,
            ]}>
            <Text style={styles.applyText}>Apply</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeader}>{title}</Text>
      {children}
    </View>
  );
}

function PresetSwatch({
  preset,
  selected,
  onPress,
}: {
  preset: AccentPreset;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.swatchWrap,
        pressed && { opacity: 0.85 },
      ]}>
      <View
        style={[
          styles.swatchCircle,
          {
            backgroundColor: preset.hex,
            borderColor: selected ? preset.hex : 'transparent',
          },
        ]}>
        {selected ? (
          <View style={[styles.checkBadge, { backgroundColor: preset.hex }]}>
            <Ionicons name="checkmark" size={12} color={BG_PRIMARY} />
          </View>
        ) : null}
      </View>
      <Text style={[styles.swatchName, selected && { color: TEXT_PRIMARY, fontWeight: '600' }]}>
        {preset.name}
      </Text>
      <Text style={styles.swatchHex}>{preset.hex}</Text>
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
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.gradientCard,
        selected && styles.gradientCardSelected,
        pressed && { opacity: 0.9 },
      ]}>
      <LinearGradient
        colors={gradient.colors}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.gradientFill}>
        <View style={styles.gradientText}>
          <Text style={styles.gradientTitle}>{gradient.name}</Text>
          <Text style={styles.gradientSub}>{gradient.subtitle}</Text>
        </View>
        {selected ? (
          <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
        ) : (
          <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_PRIMARY },
  safe: { flex: 1 },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    height: 48,
  },
  navBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 80,
  },
  navBackText: { color: TEXT_PRIMARY, fontSize: 15, fontWeight: '500' },
  navTitle: { color: TEXT_PRIMARY, fontSize: 17, fontWeight: '600' },
  navReset: { minWidth: 80, alignItems: 'flex-end' },
  navResetText: { color: SECTION_HEADER_COLOR, fontSize: 15, fontWeight: '500' },
  scroll: {
    paddingTop: 8,
    paddingHorizontal: 0,
    gap: 18,
  },
  subtitle: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 24,
    paddingBottom: 4,
  },
  section: {
    paddingHorizontal: 24,
    gap: 12,
  },
  sectionHeader: {
    color: SECTION_HEADER_COLOR,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 16,
    columnGap: 12,
  },
  swatchWrap: {
    width: '22%',
    alignItems: 'center',
    gap: 6,
  },
  swatchCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: BG_PRIMARY,
  },
  swatchName: { color: TEXT_SECONDARY, fontSize: 12, fontWeight: '500' },
  swatchHex: { color: TEXT_MUTED, fontSize: 10 },
  gradientList: { gap: 10 },
  gradientCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  gradientCardSelected: {
    borderColor: '#FFFFFF',
    borderWidth: 2,
  },
  gradientFill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 64,
  },
  gradientText: { gap: 2 },
  gradientTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  gradientSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recentDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  recentDotSelected: {
    borderColor: '#FFFFFF',
    borderWidth: 2,
  },
  addCustom: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBar: {
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: BG_PRIMARY,
  },
  applyButton: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: { color: '#0A0A0A', fontSize: 16, fontWeight: '700' },
});
