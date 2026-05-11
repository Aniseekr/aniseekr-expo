import { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  TintIntensity,
  ThemeMode,
  useTheme,
} from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

const BG = '#0A0A0A';
const SURFACE = '#1A1A1A';
const BORDER = '#2A2A2A';
const TEXT_PRIMARY = '#FFFFFF';
const TEXT_SECONDARY = '#8A8A8A';
const TEXT_MUTED = '#525252';

const MODES: { id: ThemeMode; label: string; lightSurface: string; darkSurface: string }[] = [
  { id: 'light', label: 'Light', lightSurface: '#F5EDF8', darkSurface: '#FFFFFF' },
  { id: 'dark', label: 'Dark', lightSurface: '#0A0F1C', darkSurface: '#1E293B' },
  { id: 'auto', label: 'Auto', lightSurface: '#F5EDF8', darkSurface: '#0A0F1C' },
];

const SURFACE_TOKENS = [
  { name: 'Background', hex: '#0A0F1C', description: 'App background base' },
  { name: 'Card', hex: '#1A1A1A', description: 'Anime tile surface' },
  { name: 'Elevated', hex: '#242424', description: 'Sheets & modals' },
  { name: 'Border', hex: '#2A2A2A', description: 'Divider & outline' },
];

const TINT_STEPS: TintIntensity[] = ['subtle', 'balanced', 'vivid'];

export default function ThemeModeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    theme,
    themeMode,
    setThemeMode,
    tintIntensity,
    setTintIntensity,
    increaseContrast,
    setIncreaseContrast,
  } = useTheme();

  const accent = theme.accent;
  const tintIndex = useMemo(() => TINT_STEPS.indexOf(tintIntensity), [tintIntensity]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.navBar}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [styles.navBack, pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={22} color={TEXT_PRIMARY} />
            <Text style={styles.navBackText}>Settings</Text>
          </Pressable>
          <Text style={styles.navTitle}>Theme Mode</Text>
          <View style={{ width: 80 }} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}>
          <SectionHeader>APPEARANCE</SectionHeader>
          <View style={styles.modeRow}>
            {MODES.map((m) => (
              <ModeCard
                key={m.id}
                mode={m}
                selected={themeMode === m.id}
                accent={accent}
                onPress={() => {
                  hapticsBridge.selection();
                  void setThemeMode(m.id);
                }}
              />
            ))}
          </View>

          <SectionHeader>SURFACE COLORS</SectionHeader>
          <View style={styles.surfaceList}>
            {SURFACE_TOKENS.map((t, idx) => (
              <View key={t.name}>
                <View style={styles.surfaceRow}>
                  <View
                    style={[
                      styles.surfaceSwatch,
                      { backgroundColor: t.hex, borderColor: BORDER },
                    ]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.surfaceName}>{t.name}</Text>
                    <Text style={styles.surfaceDesc}>{t.description}</Text>
                  </View>
                  <View style={styles.surfaceRight}>
                    <Text style={styles.surfaceHex}>{t.hex}</Text>
                    <Ionicons name="chevron-forward" size={16} color={TEXT_MUTED} />
                  </View>
                </View>
                {idx < SURFACE_TOKENS.length - 1 ? <View style={styles.separator} /> : null}
              </View>
            ))}
          </View>

          <SectionHeader>ACCENT TINT INTENSITY</SectionHeader>
          <View style={styles.tintCard}>
            <View style={styles.tintHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.tintTitle}>{capitalize(tintIntensity)}</Text>
                <Text style={styles.tintSubtitle}>{tintSubtitle(tintIntensity)}</Text>
              </View>
              <View
                style={[
                  styles.sampleChip,
                  { backgroundColor: accent + '22', borderColor: accent },
                ]}>
                <View style={[styles.sampleDot, { backgroundColor: accent }]} />
                <Text style={[styles.sampleText, { color: accent }]}>Sample</Text>
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
              maximumTrackTintColor={BORDER}
              thumbTintColor={TEXT_PRIMARY}
              style={{ width: '100%' }}
            />
            <View style={styles.marksRow}>
              {TINT_STEPS.map((s) => (
                <Text
                  key={s}
                  style={[
                    styles.markText,
                    s === tintIntensity && { color: accent, fontWeight: '600' },
                  ]}>
                  {capitalize(s)}
                </Text>
              ))}
            </View>
          </View>

          <SectionHeader>CONTRAST</SectionHeader>
          <View style={styles.toggleCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Increase Contrast</Text>
              <Text style={styles.toggleSubtitle}>Sharper text and borders</Text>
            </View>
            <Switch
              value={increaseContrast}
              onValueChange={(v) => {
                hapticsBridge.selection();
                void setIncreaseContrast(v);
              }}
              trackColor={{ false: '#333', true: accent }}
              thumbColor={TEXT_PRIMARY}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function SectionHeader({ children }: { children: string }) {
  return <Text style={styles.sectionHeader}>{children}</Text>;
}

function ModeCard({
  mode,
  selected,
  accent,
  onPress,
}: {
  mode: (typeof MODES)[number];
  selected: boolean;
  accent: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.modeCard,
        selected && { borderColor: accent, borderWidth: 2 },
        pressed && { opacity: 0.85 },
      ]}>
      <View style={styles.modePreview}>
        {mode.id === 'auto' ? (
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <View style={[styles.modeMini, { backgroundColor: mode.lightSurface }]}>
              <MiniPreview tone="light" />
            </View>
            <View style={[styles.modeMini, { backgroundColor: mode.darkSurface }]}>
              <MiniPreview tone="dark" />
            </View>
          </View>
        ) : (
          <View style={[styles.modeMiniFull, { backgroundColor: mode.lightSurface }]}>
            <MiniPreview tone={mode.id === 'dark' ? 'dark' : 'light'} />
          </View>
        )}
      </View>
      <View style={styles.modeFooter}>
        <Text style={[styles.modeLabel, selected && { color: accent, fontWeight: '700' }]}>
          {mode.label}
        </Text>
        {selected ? (
          <View style={[styles.modeCheck, { backgroundColor: accent }]}>
            <Ionicons name="checkmark" size={10} color={BG} />
          </View>
        ) : (
          <View style={[styles.modeCheck, { backgroundColor: BG, borderColor: '#3A3A3A', borderWidth: 1.5 }]} />
        )}
      </View>
    </Pressable>
  );
}

function MiniPreview({ tone }: { tone: 'light' | 'dark' }) {
  const headerBar = tone === 'light' ? '#1A1A2E' : '#FFFFFF';
  const subBar = tone === 'light' ? '#6B5B7B' : '#94A3B8';
  const rowBg = tone === 'light' ? '#FFFFFF' : '#1E293B';
  return (
    <View style={{ flex: 1, padding: 6, gap: 4 }}>
      <View style={{ height: 5, backgroundColor: headerBar, borderRadius: 2, width: '70%' }} />
      <View style={{ height: 3, backgroundColor: subBar, borderRadius: 1, width: '50%' }} />
      <View style={{ height: 14, backgroundColor: rowBg, borderRadius: 3, marginTop: 4 }} />
      <View style={{ height: 14, backgroundColor: rowBg, borderRadius: 3 }} />
    </View>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function tintSubtitle(t: TintIntensity) {
  switch (t) {
    case 'subtle':
      return 'Calmer accent backgrounds';
    case 'vivid':
      return 'Stronger pops of color';
    default:
      return 'Default accent intensity';
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 48,
  },
  navBack: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 80 },
  navBackText: { color: TEXT_PRIMARY, fontSize: 15, fontWeight: '500' },
  navTitle: { color: TEXT_PRIMARY, fontSize: 17, fontWeight: '600' },
  scroll: { padding: 20, gap: 16 },
  sectionHeader: {
    color: TEXT_MUTED,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
  },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeCard: {
    flex: 1,
    height: 170,
    backgroundColor: SURFACE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 8,
    gap: 8,
    overflow: 'hidden',
  },
  modePreview: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  modeMiniFull: { flex: 1 },
  modeMini: { flex: 1 },
  modeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  modeLabel: { color: TEXT_PRIMARY, fontSize: 13, fontWeight: '600' },
  modeCheck: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  surfaceList: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  surfaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  surfaceSwatch: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
  },
  surfaceName: { color: TEXT_PRIMARY, fontSize: 15, fontWeight: '500' },
  surfaceDesc: { color: TEXT_SECONDARY, fontSize: 12, marginTop: 2 },
  surfaceRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  surfaceHex: { color: TEXT_SECONDARY, fontSize: 13, fontWeight: '500' },
  separator: { height: 1, backgroundColor: BORDER },
  tintCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 18,
  },
  tintHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tintTitle: { color: TEXT_PRIMARY, fontSize: 16, fontWeight: '600' },
  tintSubtitle: { color: TEXT_SECONDARY, fontSize: 12, marginTop: 2 },
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
  sampleText: { fontSize: 12, fontWeight: '600' },
  marksRow: { flexDirection: 'row', justifyContent: 'space-between' },
  markText: { color: TEXT_MUTED, fontSize: 11, fontWeight: '500' },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  toggleTitle: { color: TEXT_PRIMARY, fontSize: 15, fontWeight: '500' },
  toggleSubtitle: { color: TEXT_SECONDARY, fontSize: 12, marginTop: 2 },
});
